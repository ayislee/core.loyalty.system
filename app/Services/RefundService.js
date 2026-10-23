'use strict'

const Database = use('Database')
const crypto = require('crypto')
const moment = use('moment')
const TransactionRefund = use('App/Models/TransactionRefund')
const WalletService = use('App/Services/WalletService')
const MemberVoucherLifecycleService = use('App/Services/MemberVoucherLifecycleService')
const MarketplaceTransactionService = use('App/Services/MarketplaceTransactionService')

class RefundError extends Error { constructor (code, message, status = 422) { super(message); this.code = code; this.status = status } }
class RefundService {
    amount (value, field) { return WalletService.amount(value, field, true) }
    number () { return `RF-${moment().format('YYYYMMDDHHmmss')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}` }
    async create (payload = {}, actor = {}) {
        const memberId = Number(payload.member_id)
        if (!memberId || !payload.idempotency_key || !payload.marketplace_transaction_number) throw new RefundError('REFUND_REQUEST_INVALID', 'Data refund tidak lengkap.')
        const verified = await MarketplaceTransactionService.verifyForRefund({ memberId, transactionNumber: payload.marketplace_transaction_number })
        const transactionTotal = Number(verified.transaction_total_amount || verified.total_amount || 0)
        const gross = this.amount(payload.refund_gross === undefined ? transactionTotal : payload.refund_gross, 'refund_gross')
        const courier = this.amount(payload.courier_deduction || 0, 'courier_deduction')
        if (courier > gross) throw new RefundError('COURIER_DEDUCTION_INVALID', 'Potongan kurir tidak boleh melebihi nilai refund.')
        const existing = await TransactionRefund.query().where('idempotency_key', payload.idempotency_key).first()
        if (existing) return { refund: existing.toJSON(), idempotent: true }
        const completed = await TransactionRefund.query().where('marketplace_transaction_number', payload.marketplace_transaction_number).whereIn('status', ['processing', 'completed', 'completed_with_warning']).fetch()
        const used = completed.toJSON().reduce((sum, row) => sum + Number(row.refund_gross || 0), 0)
        const eligible = this.amount(payload.eligible_amount === undefined ? transactionTotal : payload.eligible_amount, 'eligible_amount')
        if (used + gross > eligible) throw new RefundError('REFUND_AMOUNT_EXCEEDED', 'Nilai refund melebihi nilai transaksi yang eligible.', 409)
        const refund = new TransactionRefund()
        const snapshot = { ...verified, ...(payload.transaction_snapshot || {}) }
        Object.assign(refund, { refund_number: this.number(), member_id: memberId, marketplace_transaction_id: payload.marketplace_transaction_id || verified.transaction_id || null, marketplace_transaction_number: payload.marketplace_transaction_number, reason_code: String(payload.reason_code || 'other').slice(0, 80), description: payload.description || null, refund_gross: gross, courier_deduction: courier, refund_net: gross - courier, voucher_code: payload.voucher_code || verified.voucher_code || null, voucher_restore_status: snapshot.member_voucher_id ? 'pending' : 'not_required', transaction_snapshot: JSON.stringify(snapshot), idempotency_key: payload.idempotency_key, event_id: payload.event_id || null, requested_by_type: actor.type || 'admin', requested_by_id: actor.id || null })
        await refund.save()
        return { refund: refund.toJSON(), idempotent: false }
    }
    async approve (refundId, actor = {}) {
        const trx = await Database.beginTransaction()
        try {
            const refund = await TransactionRefund.query().transacting(trx).where('transaction_refund_id', refundId).forUpdate().first()
            if (!refund) throw new RefundError('REFUND_NOT_FOUND', 'Refund tidak ditemukan.', 404)
            if (['completed', 'completed_with_warning'].includes(refund.status)) { await trx.commit(); return { refund: refund.toJSON(), idempotent: true } }
            if (refund.status !== 'pending') throw new RefundError('REFUND_STATE_INVALID', 'Refund tidak dapat diproses pada status saat ini.', 409)
            refund.status = 'processing'; refund.approved_by_id = actor.id || null; refund.approved_at = moment().format('YYYY-MM-DD HH:mm:ss'); await refund.save(trx); await trx.commit()
            const result = await WalletService.credit({ member_id: refund.member_id, amount: Number(refund.refund_net), type: 'refund', reference_type: 'refund', reference_id: refund.refund_number, idempotency_key: `refund-credit:${refund.transaction_refund_id}`, description: `Refund ${refund.refund_number}`, created_by_type: actor.type || 'finance', created_by_id: actor.id || null })
            let voucherWarning = null
            const snapshot = (() => { try { return JSON.parse(refund.transaction_snapshot || '{}') } catch (e) { return {} } })()
            if (snapshot.member_voucher_id) {
                try { await MemberVoucherLifecycleService.returnVoucher({ member_voucher_id: snapshot.member_voucher_id, partner_id: snapshot.partner_id, store_id: snapshot.store_id, transaction_id: refund.marketplace_transaction_id || refund.marketplace_transaction_number, transaction_number: refund.marketplace_transaction_number, reason: refund.reason_code }) } catch (error) { voucherWarning = error.message }
            }
            const latest = await TransactionRefund.query().where('transaction_refund_id', refundId).first()
            latest.status = voucherWarning ? 'completed_with_warning' : 'completed'; latest.voucher_restore_status = snapshot.member_voucher_id ? (voucherWarning ? 'failed' : 'completed') : 'not_required'; latest.warning_message = voucherWarning; await latest.save()
            return { refund: latest.toJSON(), wallet: result.wallet, idempotent: result.idempotent }
        } catch (error) { await trx.rollback(); throw error }
    }
    async reject (refundId, actor = {}, reason) {
        const refund = await TransactionRefund.query().where('transaction_refund_id', refundId).first()
        if (!refund) throw new RefundError('REFUND_NOT_FOUND', 'Refund tidak ditemukan.', 404)
        if (refund.status === 'rejected') return { refund: refund.toJSON(), idempotent: true }
        if (refund.status !== 'pending') throw new RefundError('REFUND_STATE_INVALID', 'Refund tidak dapat ditolak.', 409)
        refund.status = 'rejected'; refund.rejected_by_id = actor.id || null; refund.rejected_at = moment().format('YYYY-MM-DD HH:mm:ss'); refund.rejection_reason = String(reason || '').slice(0, 500); await refund.save(); return { refund: refund.toJSON(), idempotent: false }
    }
}
const service = new RefundService(); service.Error = RefundError; module.exports = service
