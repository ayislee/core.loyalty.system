'use strict'

const crypto = require('crypto')
const Member = use('App/Models/Member')
const WalletService = use('App/Services/WalletService')
const Env = use('Env')

class MarketplaceWalletRefundController {
    validSignature (request) {
        const secret = Env.get('MARKETPLACE_CORE_SIGNATURE_SECRET')
        const timestamp = String(request.header('x-marketplace-timestamp') || '')
        const signature = String(request.header('x-marketplace-signature') || '')
        if (!secret || !timestamp || !signature || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false
        const hash = crypto.createHash('sha256').update(JSON.stringify(request.all() || {})).digest('hex')
        const expected = crypto.createHmac('sha256', secret).update(`POST\n/api/v1/internal/wallet/marketplace-refund\n${timestamp}\n${hash}`).digest('hex')
        try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) } catch (error) { return false }
    }

    async create ({ request, response }) {
        if (!this.validSignature(request)) return response.status(401).json({ status: false, code: 'INVALID_MARKETPLACE_SIGNATURE', message: 'Signature tidak valid.' })
        const amount = Number(request.input('amount'))
        const key = String(request.input('idempotency_key') || '').trim()
        const transactionNumber = String(request.input('transaction_number') || '').trim()
        const email = String(request.input('customer_email') || '').trim().toLowerCase()
        const phone = String(request.input('customer_msisdn') || '').replace(/\D/g, '')
        if (!Number.isSafeInteger(amount) || amount <= 0 || !key || !transactionNumber || (!email && !phone)) return response.status(422).json({ status: false, code: 'INVALID_MARKETPLACE_REFUND', message: 'Payload refund marketplace tidak valid.' })
        let member = email ? await Member.query().where('email', email).first() : null
        if (!member && phone) member = await Member.query().where('phone', phone).first()
        if (!member) return response.status(404).json({ status: false, code: 'MEMBER_NOT_FOUND', message: 'Member refund tidak ditemukan.' })
        try {
            const result = await WalletService.credit({
                member_id: member.member_id,
                amount,
                idempotency_key: key,
                type: 'marketplace_refund',
                reference_type: 'marketplace_transaction',
                reference_id: transactionNumber,
                description: String(request.input('reason') || 'Marketplace order refund').slice(0, 255),
                metadata: { transaction_id: request.input('transaction_id') || null, transaction_number: transactionNumber }
            })
            return response.json({ status: true, data: result })
        } catch (error) { return response.status(error.status || 500).json({ status: false, code: error.code || 'MARKETPLACE_REFUND_ERROR', message: error.message }) }
    }
}

module.exports = MarketplaceWalletRefundController
