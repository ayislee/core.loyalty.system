'use strict'

const Database = use('Database')
const Env = use('Env')
const crypto = require('crypto')
const moment = use('moment')
const Withdrawal = use('App/Models/Withdrawal')
const WithdrawalStatusHistory = use('App/Models/WithdrawalStatusHistory')
const WalletService = use('App/Services/WalletService')

class WithdrawalError extends Error {
    constructor (code, message, status = 422) { super(message); this.code = code; this.status = status }
}

class WithdrawalService {
    now () { return moment().format('YYYY-MM-DD HH:mm:ss') }
    value (name, fallback = 0) { const value = Number(Env.get(name, fallback)); return Number.isSafeInteger(value) && value >= 0 ? value : fallback }
    limits () { return { min_amount: this.value('WITHDRAWAL_MIN_AMOUNT', 10000), max_amount: this.value('WITHDRAWAL_MAX_AMOUNT', 10000000), fee_amount: this.value('WITHDRAWAL_FEE_AMOUNT', 0) } }
    key () { return crypto.createHash('sha256').update(String(Env.get('WALLET_ENCRYPTION_KEY') || Env.get('APP_KEY') || 'wallet-development-key')).digest() }
    encrypt (value) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv); const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]); return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}` }
    decrypt (value) { const [iv, tag, encrypted] = String(value || '').split(':'); if (!iv || !tag || !encrypted) return null; const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8') }
    mask (account) { const value = String(account || '').replace(/\s/g, ''); return value.length <= 4 ? '*'.repeat(value.length) : `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}` }
    number () { return `WD-${moment().format('YYYYMMDDHHmmss')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}` }
    validatePayload (payload = {}) {
        const amount = WalletService.amount(payload.amount)
        const account = String(payload.account_number || '').replace(/\s/g, '')
        const holder = String(payload.account_holder_name || '').trim()
        const channel = String(payload.channel || '').trim().toUpperCase()
        if (!account || !holder || !channel || !payload.client_request_id) throw new WithdrawalError('WITHDRAWAL_DESTINATION_INVALID', 'Data withdrawal tidak lengkap.')
        const limits = this.limits()
        if (amount < limits.min_amount || amount > limits.max_amount) throw new WithdrawalError('WITHDRAWAL_AMOUNT_INVALID', `Nominal withdrawal harus antara ${limits.min_amount} dan ${limits.max_amount}.`)
        if (amount <= limits.fee_amount) throw new WithdrawalError('WITHDRAWAL_AMOUNT_INVALID', 'Nominal withdrawal harus lebih besar dari biaya withdrawal.')
        return { amount, account, holder, channel, limits }
    }
    async history (withdrawal, oldStatus, newStatus, actor = {}, reason = null, trx = null) {
        const row = new WithdrawalStatusHistory()
        Object.assign(row, { withdrawal_id: withdrawal.withdrawal_id, old_status: oldStatus, new_status: newStatus, actor_type: actor.type || 'system', actor_id: actor.id || null, reason: reason || null })
        await row.save(trx)
    }
    async create (memberId, payload = {}) {
        const { amount, account, holder, channel, limits } = this.validatePayload(payload)
        const existing = await Withdrawal.query().where('member_id', memberId).where('idempotency_key', payload.client_request_id).first()
        if (existing) return { withdrawal: existing.toJSON(), idempotent: true, limits }
        await WalletService.getOrCreateWallet(memberId)
        const created = await Database.transaction(async (trx) => {
            const duplicate = await Withdrawal.query().transacting(trx).where('member_id', memberId).where('idempotency_key', payload.client_request_id).first()
            if (duplicate) return { withdrawal: duplicate.toJSON(), idempotent: true, limits }
            const wallet = await WalletService._lockedWallet(memberId, trx)
            const withdrawal = new Withdrawal()
            Object.assign(withdrawal, { withdrawal_number: this.number(), member_id: memberId, wallet_id: wallet.wallet_id, amount, fee: limits.fee_amount, net_amount: amount - limits.fee_amount, channel, account_number_encrypted: this.encrypt(account), account_number_masked: this.mask(account), account_holder_name_encrypted: this.encrypt(holder), status: 'pending_review', member_note: payload.member_note ? String(payload.member_note).slice(0, 500) : null, idempotency_key: payload.client_request_id })
            await withdrawal.save(trx)
            const hold = await WalletService.createHold({ member_id: memberId, amount, purpose: 'withdrawal', reference_id: withdrawal.withdrawal_number, idempotency_key: `withdrawal-hold:${withdrawal.withdrawal_id}`, trx })
            withdrawal.wallet_hold_id = hold.hold.wallet_hold_id
            await withdrawal.save(trx)
            await this.history(withdrawal, null, 'pending_review', { type: 'member', id: memberId }, null, trx)
            return { withdrawal: withdrawal.toJSON(), idempotent: false, limits }
        })
        return created
    }
    transitions (status) { return { pending_review: ['approved', 'rejected', 'cancelled'], approved: ['processing', 'rejected'], processing: ['completed', 'rejected'] }[status] || [] }
    async transition (withdrawalId, target, actor = {}, payload = {}) {
        const trx = await Database.beginTransaction()
        try {
            const withdrawal = await Withdrawal.query().transacting(trx).where('withdrawal_id', withdrawalId).forUpdate().first()
            if (!withdrawal) throw new WithdrawalError('WITHDRAWAL_NOT_FOUND', 'Withdrawal tidak ditemukan.', 404)
            if (withdrawal.status === target) { await trx.commit(); return { withdrawal: withdrawal.toJSON(), idempotent: true } }
            if (!this.transitions(withdrawal.status).includes(target)) throw new WithdrawalError('WITHDRAWAL_STATE_INVALID', 'Perubahan status withdrawal tidak valid.', 409)
            if (target === 'completed' && !String(payload.payment_reference || '').trim()) throw new WithdrawalError('WITHDRAWAL_PAYMENT_REFERENCE_REQUIRED', 'Payment reference wajib diisi.')
            const old = withdrawal.status
            if (target === 'completed') {
                const result = await WalletService.captureHold({ hold_id: withdrawal.wallet_hold_id, idempotency_key: `withdrawal-debit:${withdrawal.withdrawal_id}`, type: 'withdrawal', reference_type: 'withdrawal', reference_id: withdrawal.withdrawal_number, description: `Withdrawal ${withdrawal.withdrawal_number}`, created_by_type: actor.type || 'finance', created_by_id: actor.id || null, trx })
                withdrawal.status = 'completed'; withdrawal.payment_reference = String(payload.payment_reference).trim(); withdrawal.finance_note = payload.finance_note || withdrawal.finance_note; withdrawal.completed_at = this.now(); withdrawal.processed_by_id = actor.id || withdrawal.processed_by_id
                await withdrawal.save(trx); await this.history(withdrawal, old, 'completed', actor, payload.finance_note || null, trx)
                await trx.commit(); return { withdrawal: withdrawal.toJSON(), wallet: result.wallet, idempotent: result.idempotent }
            }
            if (target === 'rejected' || target === 'cancelled') {
                const releaseReason = payload.reason || (target === 'cancelled' ? 'Dibatalkan member' : 'Ditolak finance')
                withdrawal.status = target; withdrawal.finance_note = target === 'rejected' ? releaseReason : withdrawal.finance_note
                if (target === 'rejected') { withdrawal.reviewed_by_id = actor.id || null; withdrawal.reviewed_at = this.now() }
                await withdrawal.save(trx)
                await this.history(withdrawal, old, target, actor, releaseReason, trx)
                const result = await WalletService.releaseHold({ hold_id: withdrawal.wallet_hold_id, idempotency_key: `withdrawal-release:${withdrawal.withdrawal_id}`, reason: releaseReason, trx })
                await trx.commit()
                return { withdrawal: withdrawal.toJSON(), wallet: result.wallet, idempotent: result.idempotent }
            }
            withdrawal.status = target
            withdrawal.reviewed_by_id = actor.id || withdrawal.reviewed_by_id
            withdrawal.reviewed_at = target === 'approved' ? this.now() : withdrawal.reviewed_at
            withdrawal.processed_by_id = target === 'processing' ? actor.id || null : withdrawal.processed_by_id
            withdrawal.processed_at = target === 'processing' ? this.now() : withdrawal.processed_at
            withdrawal.finance_note = payload.finance_note || withdrawal.finance_note
            await withdrawal.save(trx); await this.history(withdrawal, old, target, actor, payload.finance_note || null, trx); await trx.commit()
            return { withdrawal: withdrawal.toJSON(), idempotent: false }
        } catch (error) { await trx.rollback(); throw error }
    }
}
const service = new WithdrawalService(); service.Error = WithdrawalError; module.exports = service
