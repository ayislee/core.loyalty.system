'use strict'
const TransactionRefund = use('App/Models/TransactionRefund')
const RefundService = use('App/Services/RefundService')
const Env = use('Env')

class RefundController {
    error (response, error) { return response.status(error.status || 500).json({ status: false, code: error.code || 'REFUND_ERROR', message: error.message || 'Gagal memproses refund.' }) }
    async list ({ request, response }) {
        const page = Math.max(1, Number(request.input('page', 1))); const rows = Math.min(100, Math.max(1, Number(request.input('rows', 20))))
        const query = TransactionRefund.query().leftJoin('members', 'members.member_id', 'transaction_refunds.member_id').select('transaction_refunds.*', 'members.firstname as member_firstname', 'members.lastname as member_lastname', 'members.phone as member_phone', 'members.email as member_email').orderBy('transaction_refunds.transaction_refund_id', 'desc')
        if (request.input('status')) query.where('transaction_refunds.status', request.input('status'))
        if (request.input('member_id')) query.where('transaction_refunds.member_id', request.input('member_id'))
        if (request.input('transaction_number')) query.where('transaction_refunds.marketplace_transaction_number', 'like', `%${request.input('transaction_number')}%`)
        const result = (await query.paginate(page, rows)).toJSON()
        result.data = result.data.map((refund) => {
            let snapshot = {}
            try { snapshot = JSON.parse(refund.transaction_snapshot || '{}') } catch (error) {}
            return { ...refund, transaction_date: snapshot.transaction_created_at || snapshot.created_at || snapshot.transaction_date || snapshot.transaction_datetime || null }
        })
        return response.json({ status: true, data: result })
    }
    async detail ({ request, response }) { const row = await TransactionRefund.query().where('transaction_refund_id', request.params.id).first(); return row ? response.json({ status: true, data: row }) : response.status(404).json({ status: false, code: 'REFUND_NOT_FOUND', message: 'Refund tidak ditemukan.' }) }
    async create ({ auth, request, response }) { try { if (`${Env.get('REFUND_FEATURE_ENABLED', 'false')}`.toLowerCase() !== 'true') return response.status(503).json({ status: false, code: 'REFUND_FEATURE_DISABLED', message: 'Fitur refund belum aktif.' }); const result = await RefundService.create(request.all(), { type: auth.user.type, id: auth.user.user_id }); return response.status(result.idempotent ? 200 : 201).json({ status: true, data: result.refund }) } catch (error) { return this.error(response, error) } }
    async approve ({ auth, request, response }) { try { const result = await RefundService.approve(request.params.id, { type: auth.user.type, id: auth.user.user_id }); return response.json({ status: true, data: result.refund }) } catch (error) { return this.error(response, error) } }
    async reject ({ auth, request, response }) { try { const result = await RefundService.reject(request.params.id, { type: auth.user.type, id: auth.user.user_id }, request.input('reason')); return response.json({ status: true, data: result.refund }) } catch (error) { return this.error(response, error) } }
}
module.exports = RefundController
