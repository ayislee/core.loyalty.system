'use strict'
const WalletService = use('App/Services/WalletService')
const WalletLedgerEntry = use('App/Models/WalletLedgerEntry')

class WalletController {
    async summary ({ auth, response }) {
        try { return response.json({ status: true, data: await WalletService.getSummary(auth.user.member_id) }) } catch (error) { return response.status(error.status || 500).json({ status: false, code: error.code || 'WALLET_ERROR', message: error.message }) }
    }
    async transactions ({ auth, request, response }) {
        try {
            const page = Math.max(1, Number(request.input('page', 1)))
            const rows = Math.min(100, Math.max(1, Number(request.input('rows', 20))))
            const query = WalletLedgerEntry.query().where('member_id', auth.user.member_id).orderBy('posted_at', 'desc')
            if (request.input('type')) query.where('type', request.input('type'))
            if (request.input('direction')) query.where('direction', request.input('direction'))
            if (request.input('date_from')) query.where('posted_at', '>=', request.input('date_from'))
            if (request.input('date_to')) query.where('posted_at', '<=', `${request.input('date_to')} 23:59:59`)
            return response.json({ status: true, data: await query.paginate(page, rows) })
        } catch (error) { return response.status(500).json({ status: false, code: 'WALLET_HISTORY_ERROR', message: 'Gagal memuat riwayat saldo.' }) }
    }
}
module.exports = WalletController
