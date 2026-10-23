'use strict'
const Withdrawal = use('App/Models/Withdrawal')
const WithdrawalService = use('App/Services/WithdrawalService')
const WithdrawalMemberNotificationService = use('App/Services/WithdrawalMemberNotificationService')

class AdminWithdrawalController {
    error (response, error) { return response.status(error.status || 500).json({ status: false, code: error.code || 'WITHDRAWAL_ERROR', message: error.message || 'Gagal memproses withdrawal.' }) }
    async list ({ request, response }) {
        const page = Math.max(1, Number(request.input('page', 1))); const rows = Math.min(100, Math.max(1, Number(request.input('rows', 20))))
        const query = Withdrawal.query().orderBy('withdrawal_id', 'desc')
        if (request.input('status')) query.where('status', request.input('status'))
        if (request.input('withdrawal_number')) query.where('withdrawal_number', 'like', `%${request.input('withdrawal_number')}%`)
        if (request.input('member_id')) query.where('member_id', request.input('member_id'))
        return response.json({ status: true, data: await query.paginate(page, rows) })
    }
    async detail ({ request, response }) {
        const row = await Withdrawal.query().where('withdrawal_id', request.params.id).with('statusHistories').with('member').first()
        if (!row) return response.status(404).json({ status: false, code: 'WITHDRAWAL_NOT_FOUND', message: 'Withdrawal tidak ditemukan.' })
        const data = row.toJSON()
        try {
            data.account_number = WithdrawalService.decrypt(row.account_number_encrypted)
            data.account_holder_name = WithdrawalService.decrypt(row.account_holder_name_encrypted)
        } catch (error) {
            return response.status(500).json({ status: false, code: 'WITHDRAWAL_DECRYPT_FAILED', message: 'Data rekening withdrawal tidak dapat dibaca.' })
        }
        return response.json({ status: true, data })
    }
    async action ({ auth, request, response }) {
        try {
            const target = request.params.action
            if (!['approved', 'rejected', 'processing', 'completed'].includes(target)) return response.status(404).json({ status: false, message: 'Action tidak tersedia.' })
            const result = await WithdrawalService.transition(request.params.id, target, { type: auth.user.type, id: auth.user.user_id }, request.all())
            if (!result.idempotent && ['approved', 'rejected', 'completed'].includes(target)) {
                setImmediate(() => WithdrawalMemberNotificationService.send({ withdrawal: result.withdrawal, status: target }).catch((error) => console.log('[withdrawal-member-notification] unexpected error', { withdrawal_id: result.withdrawal.withdrawal_id, message: error.message })))
            }
            return response.json({ status: true, message: 'Status withdrawal berhasil diperbarui.', data: result.withdrawal })
        } catch (error) { return this.error(response, error) }
    }
}
module.exports = AdminWithdrawalController
