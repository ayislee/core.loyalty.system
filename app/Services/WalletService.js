'use strict'

const Database = use('Database')
const MemberWallet = use('App/Models/MemberWallet')
const WalletLedgerEntry = use('App/Models/WalletLedgerEntry')
const WalletHold = use('App/Models/WalletHold')
const moment = use('moment')

class WalletError extends Error {
    constructor (code, message, status = 422) {
        super(message)
        this.code = code
        this.status = status
    }
}

class WalletService {
    amount (value, field = 'amount', allowZero = false) {
        const parsed = Number(value)
        if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
            throw new WalletError('WALLET_AMOUNT_INVALID', `${field} harus berupa Rupiah bulat yang valid.`)
        }
        return parsed
    }

    now () { return moment().format('YYYY-MM-DD HH:mm:ss') }

    summary (wallet) {
        const ledger = Number(wallet.ledger_balance || 0)
        const held = Number(wallet.held_balance || 0)
        return { wallet_id: wallet.wallet_id, member_id: wallet.member_id, currency: wallet.currency, ledger_balance: ledger, held_balance: held, available_balance: ledger - held, status: wallet.status }
    }

    async getOrCreateWallet (memberId, currency = 'IDR') {
        let wallet = await MemberWallet.query().where('member_id', memberId).where('currency', currency).first()
        if (wallet) return wallet
        try {
            wallet = new MemberWallet()
            wallet.member_id = memberId
            wallet.currency = currency
            wallet.ledger_balance = 0
            wallet.held_balance = 0
            wallet.status = 'active'
            await wallet.save()
            return wallet
        } catch (error) {
            // A concurrent request may have inserted the unique member/currency row.
            wallet = await MemberWallet.query().where('member_id', memberId).where('currency', currency).first()
            if (wallet) return wallet
            throw error
        }
    }

    async getSummary (memberId) {
        return this.summary(await this.getOrCreateWallet(memberId))
    }

    async _lockedWallet (memberId, trx) {
        const wallet = await MemberWallet.query().transacting(trx).where('member_id', memberId).where('currency', 'IDR').forUpdate().first()
        if (!wallet) throw new WalletError('WALLET_NOT_FOUND', 'Wallet tidak ditemukan.', 404)
        if (wallet.status !== 'active') throw new WalletError('WALLET_SUSPENDED', 'Wallet tidak aktif.', 409)
        return wallet
    }

    async credit (payload = {}) {
        const amount = this.amount(payload.amount)
        if (!payload.member_id || !payload.idempotency_key) throw new WalletError('WALLET_OPERATION_INVALID', 'member_id dan idempotency_key wajib diisi.')
        await this.getOrCreateWallet(payload.member_id)
        const trx = await Database.beginTransaction()
        try {
            const existing = await WalletLedgerEntry.query().transacting(trx).where('idempotency_key', payload.idempotency_key).first()
            if (existing) { await trx.commit(); return { entry: existing.toJSON(), idempotent: true } }
            const wallet = await this._lockedWallet(payload.member_id, trx)
            const before = Number(wallet.ledger_balance || 0)
            wallet.ledger_balance = before + amount
            wallet.version = Number(wallet.version || 0) + 1
            await wallet.save(trx)
            const entry = new WalletLedgerEntry()
            Object.assign(entry, { wallet_id: wallet.wallet_id, member_id: wallet.member_id, direction: 'credit', type: payload.type || 'adjustment', amount, balance_before: before, balance_after: before + amount, reference_type: payload.reference_type || null, reference_id: payload.reference_id || null, idempotency_key: payload.idempotency_key, description: payload.description || null, metadata: payload.metadata ? JSON.stringify(payload.metadata) : null, created_by_type: payload.created_by_type || 'system', created_by_id: payload.created_by_id || null, posted_at: this.now() })
            await entry.save(trx)
            await trx.commit()
            return { entry: entry.toJSON(), wallet: this.summary(wallet), idempotent: false }
        } catch (error) { await trx.rollback(); throw error }
    }

    async createHold (payload = {}) {
        const amount = this.amount(payload.amount)
        if (!payload.member_id || !payload.reference_id || !payload.idempotency_key) throw new WalletError('WALLET_OPERATION_INVALID', 'Data hold tidak lengkap.')
        await this.getOrCreateWallet(payload.member_id)
        const trx = payload.trx || await Database.beginTransaction()
        const ownsTrx = !payload.trx
        try {
            const existing = await WalletHold.query().transacting(trx).where('idempotency_key', payload.idempotency_key).first()
            if (existing) { if (ownsTrx) await trx.commit(); return { hold: existing.toJSON(), idempotent: true } }
            const wallet = await this._lockedWallet(payload.member_id, trx)
            const available = Number(wallet.ledger_balance || 0) - Number(wallet.held_balance || 0)
            if (available < amount) throw new WalletError('INSUFFICIENT_BALANCE', 'Saldo tersedia tidak mencukupi.', 409)
            wallet.held_balance = Number(wallet.held_balance || 0) + amount
            wallet.version = Number(wallet.version || 0) + 1
            await wallet.save(trx)
            const hold = new WalletHold()
            Object.assign(hold, { wallet_id: wallet.wallet_id, member_id: wallet.member_id, purpose: payload.purpose || 'checkout', reference_id: payload.reference_id, amount, status: 'active', idempotency_key: payload.idempotency_key, expires_at: payload.expires_at || null })
            await hold.save(trx)
            if (ownsTrx) await trx.commit()
            return { hold: hold.toJSON(), wallet: this.summary(wallet), idempotent: false }
        } catch (error) { if (ownsTrx) await trx.rollback(); throw error }
    }

    async _changeHold (payload, mode) {
        if (!payload.hold_id || !payload.idempotency_key) throw new WalletError('WALLET_OPERATION_INVALID', 'hold_id dan idempotency_key wajib diisi.')
        const trx = payload.trx || await Database.beginTransaction()
        const ownsTrx = !payload.trx
        try {
            const hold = await WalletHold.query().transacting(trx).where('wallet_hold_id', payload.hold_id).forUpdate().first()
            if (!hold) throw new WalletError('WALLET_HOLD_NOT_FOUND', 'Hold saldo tidak ditemukan.', 404)
            if (hold.status !== 'active') { if (ownsTrx) await trx.commit(); return { hold: hold.toJSON(), idempotent: true } }
            const wallet = await this._lockedWallet(hold.member_id, trx)
            const amount = Number(hold.amount)
            const held = Number(wallet.held_balance || 0)
            if (held < amount) throw new WalletError('WALLET_OPERATION_CONFLICT', 'Data hold wallet tidak konsisten.', 409)
            wallet.held_balance = held - amount
            wallet.version = Number(wallet.version || 0) + 1
            if (mode === 'capture') {
                const existing = await WalletLedgerEntry.query().transacting(trx).where('idempotency_key', payload.idempotency_key).first()
                if (!existing) {
                    const before = Number(wallet.ledger_balance || 0)
                    if (before < amount) throw new WalletError('WALLET_OPERATION_CONFLICT', 'Saldo ledger tidak mencukupi.', 409)
                    wallet.ledger_balance = before - amount
                    const entry = new WalletLedgerEntry()
                    Object.assign(entry, { wallet_id: wallet.wallet_id, member_id: wallet.member_id, direction: 'debit', type: payload.type || 'marketplace_payment', amount, balance_before: before, balance_after: before - amount, reference_type: payload.reference_type || hold.purpose, reference_id: payload.reference_id || hold.reference_id, idempotency_key: payload.idempotency_key, description: payload.description || null, metadata: payload.metadata ? JSON.stringify(payload.metadata) : null, created_by_type: payload.created_by_type || 'system', created_by_id: payload.created_by_id || null, posted_at: this.now() })
                    await entry.save(trx)
                }
                hold.status = 'captured'; hold.captured_at = this.now()
            } else {
                hold.status = payload.expired ? 'expired' : 'released'; hold.released_at = this.now(); hold.release_reason = payload.reason || null
            }
            await wallet.save(trx)
            await hold.save(trx)
            if (ownsTrx) await trx.commit()
            return { hold: hold.toJSON(), wallet: this.summary(wallet), idempotent: false }
        } catch (error) { if (ownsTrx) await trx.rollback(); throw error }
    }

    captureHold (payload) { return this._changeHold(payload, 'capture') }
    releaseHold (payload) { return this._changeHold(payload, 'release') }
    expireHold (payload) { return this._changeHold({ ...payload, expired: true }, 'release') }
}

const service = new WalletService()
service.Error = WalletError
module.exports = service
