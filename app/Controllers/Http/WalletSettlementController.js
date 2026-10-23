'use strict'

const crypto = require('crypto')
const WalletHold = use('App/Models/WalletHold')
const WalletService = use('App/Services/WalletService')
const Env = use('Env')

class WalletSettlementController {
    validSignature (request) {
        const secret = Env.get('MARKETPLACE_CORE_SIGNATURE_SECRET')
        const timestamp = String(request.header('x-marketplace-timestamp') || '')
        const signature = String(request.header('x-marketplace-signature') || '')
        if (!secret || !timestamp || !signature || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false
        const body = request.all() || {}
        const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')
        const expected = crypto.createHmac('sha256', secret).update(`POST\n/api/v1/internal/wallet/payment-status\n${timestamp}\n${hash}`).digest('hex')
        try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) } catch (error) { return false }
    }
    async paymentStatus ({ request, response }) {
        if (!this.validSignature(request)) return response.status(401).json({ status: false, code: 'INVALID_MARKETPLACE_SIGNATURE', message: 'Signature tidak valid.' })
        const checkoutId = String(request.input('client_request_id') || '').trim()
        const requestedHoldId = Number(request.input('wallet_hold_id') || 0)
        const marketplaceTransactionId = Number(request.input('marketplace_transaction_id') || 0)
        const paymentStatus = String(request.input('payment_status') || '').toLowerCase()
        const eventId = String(request.input('event_id') || '').trim()
        if (!checkoutId || !requestedHoldId || !marketplaceTransactionId || !eventId || !['paid', 'settled', 'failed', 'expired', 'cancelled'].includes(paymentStatus)) return response.status(422).json({ status: false, code: 'INVALID_PAYMENT_STATUS_EVENT', message: 'Payload payment status tidak valid.' })
        const hold = await WalletHold.query().where('purpose', 'checkout').where('reference_id', checkoutId).first()
        if (!hold) return response.status(404).json({ status: false, code: 'WALLET_HOLD_NOT_FOUND', message: 'Hold checkout tidak ditemukan.' })
        if (Number(hold.wallet_hold_id) !== requestedHoldId) return response.status(409).json({ status: false, code: 'WALLET_HOLD_MISMATCH', message: 'Hold tidak sesuai dengan checkout.' })
        try {
            const result = ['paid', 'settled'].includes(paymentStatus)
                ? await WalletService.captureHold({ hold_id: hold.wallet_hold_id, idempotency_key: `checkout-debit:${checkoutId}`, type: 'marketplace_payment', reference_type: 'marketplace_transaction', reference_id: marketplaceTransactionId, description: 'Pembayaran marketplace split saldo/QRIS', metadata: { event_id: eventId, payment_status: paymentStatus, marketplace_transaction_id: marketplaceTransactionId } })
                : await WalletService.releaseHold({ hold_id: hold.wallet_hold_id, idempotency_key: `checkout-release:${checkoutId}`, reason: `Payment ${paymentStatus}`, metadata: { event_id: eventId, payment_status: paymentStatus, marketplace_transaction_id: marketplaceTransactionId } })
            return response.json({ status: true, data: result })
        } catch (error) { return response.status(error.status || 500).json({ status: false, code: error.code || 'WALLET_SETTLEMENT_ERROR', message: error.message }) }
    }
}
module.exports = WalletSettlementController
