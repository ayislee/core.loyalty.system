'use strict'
const TransactionRefund = use('App/Models/TransactionRefund')
const Database = use('Database')
const ThisLib = use('App/Lib/LoyaltyLib')
const RefundService = use('App/Services/RefundService')
const Env = use('Env')

class RefundController {
    async partnerScopeId (user) {
        const partnerId = await ThisLib.getPartnerIDFromUser(user.user_id)
        return user.type === 'partner' ? (partnerId || '') : (partnerId || null)
    }
    partnerMemberIds (partnerId) {
        return Database.from('member_partners').where('partner_id', partnerId).whereNull('deleted_at').select('member_id')
    }
    async ensureRefundScope (refundId, user) {
        const partnerId = await this.partnerScopeId(user)
        if (partnerId === null) return
        const row = await TransactionRefund.query().where('transaction_refund_id', refundId).whereIn('member_id', this.partnerMemberIds(partnerId)).first()
        if (!row) { const error = new Error('Refund tidak ditemukan.'); error.status = 404; error.code = 'REFUND_NOT_FOUND'; throw error }
    }
    error (response, error) { return response.status(error.status || 500).json({ status: false, code: error.code || 'REFUND_ERROR', message: error.message || 'Gagal memproses refund.' }) }
    async list ({ auth, request, response }) {
        const page = Math.max(1, Number(request.input('page', 1))); const rows = Math.min(100, Math.max(1, Number(request.input('rows', 20))))
        const query = TransactionRefund.query().leftJoin('members', 'members.member_id', 'transaction_refunds.member_id').select('transaction_refunds.*', 'members.firstname as member_firstname', 'members.lastname as member_lastname', 'members.phone as member_phone', 'members.email as member_email').orderBy('transaction_refunds.transaction_refund_id', 'desc')
        if (request.input('status')) query.where('transaction_refunds.status', request.input('status'))
        if (request.input('member_id')) query.where('transaction_refunds.member_id', request.input('member_id'))
        if (request.input('transaction_number')) query.where('transaction_refunds.marketplace_transaction_number', 'like', `%${request.input('transaction_number')}%`)
        const scopedPartnerId = await this.partnerScopeId(auth.user)
        const requestedPartnerId = Number(request.input('partner_id'))
        const partnerId = scopedPartnerId !== null ? scopedPartnerId : (requestedPartnerId > 0 ? requestedPartnerId : null)
        const year = Number(request.input('year'))
        const month = Number(request.input('month'))
        const memberKeyword = String(request.input('member_keyword') || '').trim()
        const summaryQuery = Database
            .from('transaction_refunds')
            .whereIn('status', ['completed', 'completed_with_warning'])
            .select(Database.raw('COALESCE(SUM(COALESCE(refund_net, 0)), 0) as total_refund'))

        if (year >= 2000 && year <= 2100) {
            query.whereRaw('YEAR(transaction_refunds.created_at) = ?', [year])
            summaryQuery.whereRaw('YEAR(created_at) = ?', [year])
        }
        if (month >= 1 && month <= 12) {
            query.whereRaw('MONTH(transaction_refunds.created_at) = ?', [month])
            summaryQuery.whereRaw('MONTH(created_at) = ?', [month])
        }
        if (partnerId !== null) {
            query.whereIn('transaction_refunds.member_id', this.partnerMemberIds(partnerId))
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
            query.whereIn('transaction_refunds.member_id', memberIds.clone())
            summaryQuery.whereIn('member_id', memberIds)
        }
        const [pagination, summary] = await Promise.all([
            query.paginate(page, rows),
            summaryQuery.first()
        ])
        const result = pagination.toJSON()
        result.data = result.data.map((refund) => {
            let snapshot = {}
            try { snapshot = JSON.parse(refund.transaction_snapshot || '{}') } catch (error) {}
            return { ...refund, transaction_date: snapshot.transaction_created_datetime || snapshot.transaction_created_at || snapshot.created_at || snapshot.transaction_date || snapshot.transaction_datetime || null }
        })
        return response.json({ status: true, data: result, summary: { total_refund: summary.total_refund } })
    }
    async detail ({ auth, request, response }) { try { await this.ensureRefundScope(request.params.id, auth.user); const row = await TransactionRefund.query().where('transaction_refund_id', request.params.id).first(); return row ? response.json({ status: true, data: row }) : response.status(404).json({ status: false, code: 'REFUND_NOT_FOUND', message: 'Refund tidak ditemukan.' }) } catch (error) { return this.error(response, error) } }
    async create ({ auth, request, response }) { try { if (`${Env.get('REFUND_FEATURE_ENABLED', 'false')}`.toLowerCase() !== 'true') return response.status(503).json({ status: false, code: 'REFUND_FEATURE_DISABLED', message: 'Fitur refund belum aktif.' }); const partnerId = await this.partnerScopeId(auth.user); if (partnerId !== null) { const member = await Database.from('member_partners').where('partner_id', partnerId).where('member_id', request.input('member_id')).whereNull('deleted_at').first(); if (!member) return response.status(403).json({ status: false, code: 'REFUND_NOT_ALLOWED', message: 'Member tidak terhubung ke partner Anda.' }) } const result = await RefundService.create(request.all(), { type: auth.user.type, id: auth.user.user_id }); return response.status(result.idempotent ? 200 : 201).json({ status: true, data: result.refund }) } catch (error) { return this.error(response, error) } }
    async approve ({ auth, request, response }) { try { await this.ensureRefundScope(request.params.id, auth.user); const result = await RefundService.approve(request.params.id, { type: auth.user.type, id: auth.user.user_id }); return response.json({ status: true, data: result.refund }) } catch (error) { return this.error(response, error) } }
    async reject ({ auth, request, response }) { try { await this.ensureRefundScope(request.params.id, auth.user); const result = await RefundService.reject(request.params.id, { type: auth.user.type, id: auth.user.user_id }, request.input('reason')); return response.json({ status: true, data: result.refund }) } catch (error) { return this.error(response, error) } }
}
module.exports = RefundController
