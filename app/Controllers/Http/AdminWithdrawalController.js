'use strict'
const Withdrawal = use('App/Models/Withdrawal')
const Database = use('Database')
const ThisLib = use('App/Lib/LoyaltyLib')
const WithdrawalService = use('App/Services/WithdrawalService')
const WithdrawalMemberNotificationService = use('App/Services/WithdrawalMemberNotificationService')

class AdminWithdrawalController {
    async partnerScopeId (user) {
        const partnerId = await ThisLib.getPartnerIDFromUser(user.user_id)
        return user.type === 'partner' ? (partnerId || '') : (partnerId || null)
    }
    partnerMemberIds (partnerId) {
        return Database.from('member_partners').where('partner_id', partnerId).whereNull('deleted_at').select('member_id')
    }
    async ensureWithdrawalScope (withdrawalId, user) {
        const partnerId = await this.partnerScopeId(user)
        if (partnerId === null) return
        const row = await Withdrawal.query().where('withdrawal_id', withdrawalId).whereIn('member_id', this.partnerMemberIds(partnerId)).first()
        if (!row) { const error = new Error('Withdrawal tidak ditemukan.'); error.status = 404; error.code = 'WITHDRAWAL_NOT_FOUND'; throw error }
    }
    error (response, error) { return response.status(error.status || 500).json({ status: false, code: error.code || 'WITHDRAWAL_ERROR', message: error.message || 'Gagal memproses withdrawal.' }) }
    async list ({ auth, request, response }) {
        const page = Math.max(1, Number(request.input('page', 1))); const rows = Math.min(100, Math.max(1, Number(request.input('rows', 20))))
        const query = Withdrawal.query().with('member').orderBy('withdrawal_id', 'desc')
        if (request.input('status')) query.where('status', request.input('status'))
        if (request.input('withdrawal_number')) query.where('withdrawal_number', 'like', `%${request.input('withdrawal_number')}%`)
        if (request.input('member_id')) query.where('member_id', request.input('member_id'))
        const scopedPartnerId = await this.partnerScopeId(auth.user)
        const requestedPartnerId = Number(request.input('partner_id'))
        const partnerId = scopedPartnerId !== null ? scopedPartnerId : (requestedPartnerId > 0 ? requestedPartnerId : null)
        const year = Number(request.input('year'))
        const month = Number(request.input('month'))
        const memberKeyword = String(request.input('member_keyword') || '').trim()
        const summaryQuery = Database
            .from('withdrawals')
            .where('status', 'completed')
            .select(Database.raw('COALESCE(SUM(COALESCE(net_amount, 0)), 0) as total_withdrawn'))

        if (year >= 2000 && year <= 2100) {
            query.whereRaw('YEAR(created_at) = ?', [year])
            summaryQuery.whereRaw('YEAR(created_at) = ?', [year])
        }
        if (month >= 1 && month <= 12) {
            query.whereRaw('MONTH(created_at) = ?', [month])
            summaryQuery.whereRaw('MONTH(created_at) = ?', [month])
        }
        if (partnerId !== null) {
            query.whereIn('member_id', this.partnerMemberIds(partnerId))
            summaryQuery.whereIn('member_id', this.partnerMemberIds(partnerId))
        }
        if (memberKeyword) {
            const keyword = `%${memberKeyword}%`
            const memberIds = Database
                .from('members')
                .whereNull('deleted_at')
                .where(function () {
                    this.where('firstname', 'like', keyword)
                        .orWhere('lastname', 'like', keyword)
                        .orWhere('email', 'like', keyword)
                        .orWhere('phone', 'like', keyword)
                })
                .select('member_id')
            query.whereIn('member_id', memberIds.clone())
            summaryQuery.whereIn('member_id', memberIds)
        }
        const [data, summary] = await Promise.all([
            query.paginate(page, rows),
            summaryQuery.first()
        ])
        return response.json({ status: true, data, summary: { total_withdrawn: summary.total_withdrawn } })
    }
    async detail ({ auth, request, response }) {
        try { await this.ensureWithdrawalScope(request.params.id, auth.user) } catch (error) { return this.error(response, error) }
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
            await this.ensureWithdrawalScope(request.params.id, auth.user)
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
