'use strict'

const axios = use('axios')
const Env = use('Env')
const Member = use('App/Models/Member')

class MarketplaceTransactionService {
    async getByNumber (transactionNumber) {
        const response = await axios.get(`${Env.get('MARKETPLACE_CORE')}transaction/number/${encodeURIComponent(transactionNumber)}`)
        const transaction = response?.data?.data
        if (!transaction) { const error = new Error('Transaksi marketplace tidak ditemukan.'); error.code = 'MARKETPLACE_TRANSACTION_NOT_FOUND'; error.status = 404; throw error }
        return transaction
    }
    paid (transaction = {}) {
        const values = [transaction.transaction_payment_status_name, transaction.transaction_approve_status_name, transaction.payment_status, transaction.transaction_status_name].map((value) => String(value || '').toLowerCase())
        return values.some((value) => ['paid', 'settlement', 'settled', 'approved', 'progressing'].includes(value))
    }
    async verifyForRefund ({ memberId, transactionNumber }) {
        const [member, transaction] = await Promise.all([Member.query().where('member_id', memberId).first(), this.getByNumber(transactionNumber)])
        if (!member) { const error = new Error('Member tidak ditemukan.'); error.code = 'MEMBER_NOT_FOUND'; error.status = 404; throw error }
        const email = String(member.email || '').trim().toLowerCase(); const phone = String(member.phone || '').replace(/\D/g, '')
        const transactionEmail = String(transaction.customer_email || '').trim().toLowerCase(); const transactionPhone = String(transaction.customer_msisdn || '').replace(/\D/g, '')
        if (!((email && email === transactionEmail) || (phone && phone === transactionPhone))) { const error = new Error('Transaksi bukan milik member refund.'); error.code = 'REFUND_NOT_ELIGIBLE'; error.status = 403; throw error }
        if (!this.paid(transaction)) { const error = new Error('Transaksi belum dibayar atau belum eligible untuk refund.'); error.code = 'REFUND_NOT_ELIGIBLE'; error.status = 409; throw error }
        return transaction
    }
}
module.exports = new MarketplaceTransactionService()
