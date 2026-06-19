'use strict'

const Database = use('Database')
const MemberVoucher = use('App/Models/MemberVoucher')
const RedeemMerchant = use('App/Models/RedeemMerchant')
const Voucher = use('App/Models/Voucher')
const VoucherExchange = use('App/Models/VoucherExchange')
const moment = use('moment')

class MemberVoucherLifecycleService {
    _normalizePayload(data = {}) {
        const memberVoucherId = parseInt(data.member_voucher_id, 10)
        const partnerId = parseInt(data.partner_id, 10)
        const storeId = parseInt(data.store_id, 10) || null
        const transactionId = `${data.transaction_id || ''}`.trim()
        const transactionNumber = `${data.transaction_number || ''}`.trim() || null

        if (!memberVoucherId) throw new Error('member_voucher_id is required')
        if (!partnerId) throw new Error('invalid partner')
        if (!transactionId) throw new Error('transaction_id is required')

        return {
            member_voucher_id: memberVoucherId,
            partner_id: partnerId,
            store_id: storeId,
            transaction_id: transactionId,
            transaction_number: transactionNumber,
            note: `${data.note || ''}`.trim() || null,
            reason: `${data.reason || ''}`.trim().slice(0, 255) || null
        }
    }

    async _findRedeemMerchant(data, trx) {
        let merchant = null

        if (data.store_id) {
            merchant = await RedeemMerchant.query()
                .transacting(trx)
                .where('partner_id', data.partner_id)
                .where('store_id', data.store_id)
                .first()
        }

        if (!merchant) {
            merchant = await RedeemMerchant.query()
                .transacting(trx)
                .where('partner_id', data.partner_id)
                .orderBy('redeem_merchant_id', 'asc')
                .first()
        }

        return merchant
    }

    async _lockMemberVoucher(data, trx) {
        const memberVoucher = await MemberVoucher.query()
            .transacting(trx)
            .where('member_voucher_id', data.member_voucher_id)
            .forUpdate()
            .first()

        if (!memberVoucher) throw new Error('invalid voucher')

        const voucher = await Voucher.query()
            .transacting(trx)
            .where('voucher_id', memberVoucher.voucher_id)
            .where('partner_id', data.partner_id)
            .first()

        if (!voucher) throw new Error('voucher not available for this partner')
        return memberVoucher
    }

    async _findLifecycle(data, trx) {
        return VoucherExchange.query()
            .transacting(trx)
            .where('member_voucher_id', data.member_voucher_id)
            .where('external_transaction_id', data.transaction_id)
            .forUpdate()
            .first()
    }

    async _findLegacyExchange(data, redeemMerchantId, trx) {
        const query = VoucherExchange.query()
            .transacting(trx)
            .where('member_voucher_id', data.member_voucher_id)
            .whereNull('external_transaction_id')
            .where('lifecycle_status', 'exchanged')
            .orderBy('voucher_exchange_id', 'desc')
            .forUpdate()

        if (redeemMerchantId) query.where('redeem_merchant_id', redeemMerchantId)
        else query.whereNull('redeem_merchant_id')

        return query.first()
    }

    async exchange(rawData = {}) {
        const data = this._normalizePayload(rawData)
        const trx = await Database.beginTransaction()

        try {
            const memberVoucher = await this._lockMemberVoucher(data, trx)
            const redeemMerchant = await this._findRedeemMerchant(data, trx)
            const existing = await this._findLifecycle(data, trx)

            if (existing) {
                if (existing.lifecycle_status === 'returned') {
                    await trx.commit()
                    return {
                        status: true,
                        message: 'voucher transaction has already been returned',
                        data: { lifecycle_status: 'returned', idempotent: true }
                    }
                }

                if (`${memberVoucher.used}` !== '1') {
                    memberVoucher.used = '1'
                    await memberVoucher.save(trx)
                }

                await trx.commit()
                return {
                    status: true,
                    message: 'voucher has already been exchanged',
                    data: { lifecycle_status: 'exchanged', idempotent: true }
                }
            }

            if (memberVoucher.expire_date && moment(memberVoucher.expire_date).isSameOrBefore(moment())) {
                throw new Error('voucher has expired')
            }

            const activeExchange = await VoucherExchange.query()
                .transacting(trx)
                .where('member_voucher_id', data.member_voucher_id)
                .where('lifecycle_status', 'exchanged')
                .forUpdate()
                .first()

            if (`${memberVoucher.used}` === '1' || activeExchange) throw new Error('invalid voucher')

            const exchange = new VoucherExchange()
            exchange.member_voucher_id = data.member_voucher_id
            exchange.redeem_merchant_id = redeemMerchant ? redeemMerchant.redeem_merchant_id : null
            exchange.store_id = data.store_id
            exchange.external_transaction_id = data.transaction_id
            exchange.external_transaction_number = data.transaction_number
            exchange.lifecycle_status = 'exchanged'
            exchange.exchanged_at = moment().format('YYYY-MM-DD HH:mm:ss')
            exchange.note = data.note
            await exchange.save(trx)

            memberVoucher.used = '1'
            await memberVoucher.save(trx)
            await trx.commit()

            return {
                status: true,
                message: 'voucher exchanged successfully',
                data: { lifecycle_status: 'exchanged', idempotent: false }
            }
        } catch (error) {
            await trx.rollback()
            throw error
        }
    }

    async returnVoucher(rawData = {}) {
        const data = this._normalizePayload(rawData)
        const trx = await Database.beginTransaction()

        try {
            const memberVoucher = await this._lockMemberVoucher(data, trx)
            const redeemMerchant = await this._findRedeemMerchant(data, trx)
            let exchange = await this._findLifecycle(data, trx)

            if (!exchange) {
                exchange = await this._findLegacyExchange(data, redeemMerchant ? redeemMerchant.redeem_merchant_id : null, trx)
            }

            if (exchange && exchange.lifecycle_status === 'returned') {
                await trx.commit()
                return {
                    status: true,
                    message: 'voucher has already been returned',
                    data: { lifecycle_status: 'returned', idempotent: true }
                }
            }

            const returnedAt = moment().format('YYYY-MM-DD HH:mm:ss')

            if (!exchange) {
                exchange = new VoucherExchange()
                exchange.member_voucher_id = data.member_voucher_id
                exchange.redeem_merchant_id = redeemMerchant ? redeemMerchant.redeem_merchant_id : null
                exchange.exchanged_at = null
            }

            exchange.external_transaction_id = data.transaction_id
            exchange.external_transaction_number = data.transaction_number || exchange.external_transaction_number
            exchange.store_id = data.store_id || exchange.store_id
            exchange.lifecycle_status = 'returned'
            exchange.returned_at = returnedAt
            exchange.return_reason = data.reason
            await exchange.save(trx)

            const activeExchange = await VoucherExchange.query()
                .transacting(trx)
                .where('member_voucher_id', data.member_voucher_id)
                .where('lifecycle_status', 'exchanged')
                .forUpdate()
                .first()

            if (!activeExchange && `${memberVoucher.used}` !== '0') {
                memberVoucher.used = '0'
                await memberVoucher.save(trx)
            }

            await trx.commit()

            return {
                status: true,
                message: 'voucher returned successfully',
                data: { lifecycle_status: 'returned', idempotent: false }
            }
        } catch (error) {
            await trx.rollback()
            throw error
        }
    }
}

module.exports = new MemberVoucherLifecycleService()
