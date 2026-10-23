'use strict'
const Withdrawal = use('App/Models/Withdrawal')
const WithdrawalService = use('App/Services/WithdrawalService')
const WithdrawalConfirmationService = use('App/Services/WithdrawalConfirmationService')
const FinanceNotificationService = use('App/Services/FinanceNotificationService')
const Env = use('Env')

class WithdrawalController {
    error (response, error) { return response.status(error.status || 500).json({ status: false, code: error.code || 'WITHDRAWAL_ERROR', message: error.message || 'Gagal memproses withdrawal.' }) }
    async create ({ auth, request, response }) {
        try {
            if (`${Env.get('WITHDRAWAL_FEATURE_ENABLED', 'false')}`.toLowerCase() !== 'true') return response.status(503).json({ status: false, code: 'WITHDRAWAL_FEATURE_DISABLED', message: 'Fitur withdrawal belum aktif.' })
            const result = await WithdrawalConfirmationService.request({ member: auth.user, payload: request.all() })
            return response.status(202).json({ status: true, message: 'Token konfirmasi telah dikirim ke WhatsApp Anda.', data: result })
        } catch (error) { return this.error(response, error) }
    }
    async confirm ({ auth, request, response }) {
        try {
            if (`${Env.get('WITHDRAWAL_FEATURE_ENABLED', 'false')}`.toLowerCase() !== 'true') return response.status(503).json({ status: false, code: 'WITHDRAWAL_FEATURE_DISABLED', message: 'Fitur withdrawal belum aktif.' })
            const result = await WithdrawalConfirmationService.confirm({ memberId: auth.user.member_id, confirmationId: request.input('confirmation_id'), token: request.input('token') })
            if (!result.idempotent) {
                await FinanceNotificationService.queueWithdrawal(result.withdrawal)
                FinanceNotificationService.sendPending(20).catch(() => {})
                WithdrawalConfirmationService.notifyStore(result.withdrawal).catch((error) => console.log('[withdrawal-notification] failed to notify store', { withdrawal_id: result.withdrawal.withdrawal_id, message: error.message }))
            }
            return response.status(result.idempotent ? 200 : 201).json({ status: true, message: result.idempotent ? 'Withdrawal sudah pernah dibuat.' : 'Pengajuan withdrawal berhasil dibuat.', data: { withdrawal: result.withdrawal, limits: result.limits } })
        } catch (error) { return this.error(response, error) }
    }
    async list ({ auth, request, response }) {
        const page = Math.max(1, Number(request.input('page', 1))); const rows = Math.min(100, Math.max(1, Number(request.input('rows', 20))))
        const query = Withdrawal.query().where('member_id', auth.user.member_id).orderBy('withdrawal_id', 'desc')
        if (request.input('status')) query.where('status', request.input('status'))
        return response.json({ status: true, data: await query.paginate(page, rows), limits: WithdrawalService.limits() })
    }
    async detail ({ auth, request, response }) {
        const row = await Withdrawal.query().where('withdrawal_id', request.params.id).where('member_id', auth.user.member_id).with('statusHistories').first()
        if (!row) return response.status(404).json({ status: false, code: 'WITHDRAWAL_NOT_FOUND', message: 'Withdrawal tidak ditemukan.' })
        return response.json({ status: true, data: row })
    }
    async cancel ({ auth, request, response }) {
        try {
            const row = await Withdrawal.query().where('withdrawal_id', request.params.id).where('member_id', auth.user.member_id).first()
            if (!row) return response.status(404).json({ status: false, code: 'WITHDRAWAL_NOT_FOUND', message: 'Withdrawal tidak ditemukan.' })
            const result = await WithdrawalService.transition(row.withdrawal_id, 'cancelled', { type: 'member', id: auth.user.member_id }, { reason: 'Dibatalkan oleh member' })
            return response.json({ status: true, message: 'Withdrawal dibatalkan.', data: result.withdrawal })
        } catch (error) { return this.error(response, error) }
    }
}
module.exports = WithdrawalController
