'use strict'

const Database = use('Database')
const UserPartner = use('App/Models/UserPartner')
const moment = use('moment')

class PartnerLoyaltyReportService {
    _toPositiveInteger(value, fallback = null) {
        const parsed = parseInt(value, 10)
        return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
    }

    _normalizePagination(params = {}) {
        const page = this._toPositiveInteger(params.page, 1)
        const rows = Math.min(this._toPositiveInteger(params.rows, 10), 100)

        return { page, rows, offset: (page - 1) * rows }
    }

    _normalizePeriod(params = {}) {
        const now = moment()
        const year = this._toPositiveInteger(params.year, now.year())
        const month = this._toPositiveInteger(params.month, now.month() + 1)

        if (year < 2000 || year > 2100) throw new Error('year is invalid')
        if (month < 1 || month > 12) throw new Error('month is invalid')

        const start = moment(`${year}-${String(month).padStart(2, '0')}-01`, 'YYYY-MM-DD', true)
        if (!start.isValid()) throw new Error('period is invalid')

        return {
            year,
            month,
            timezone: 'Asia/Jakarta',
            start: start.startOf('day').format('YYYY-MM-DD HH:mm:ss'),
            end: start.clone().add(1, 'month').startOf('day').format('YYYY-MM-DD HH:mm:ss')
        }
    }

    async _resolvePartnerScope(authUser, requestedPartnerId) {
        if (!authUser) throw new Error('Unauthorized')

        if (authUser.type === 'admin') {
            if (requestedPartnerId === null || requestedPartnerId === undefined || `${requestedPartnerId}`.trim() === '') {
                return null
            }

            const partnerId = this._toPositiveInteger(requestedPartnerId)
            if (!partnerId) throw new Error('partner_id is invalid')
            return partnerId
        }

        if (authUser.type !== 'partner') throw new Error('User is not allowed to access partner reports')

        const userPartner = await UserPartner.query()
            .where('user_id', authUser.user_id)
            .first()

        if (!userPartner) throw new Error('Partner user is not linked to a partner')
        return userPartner.partner_id
    }

    _normalizeKeyword(value) {
        return `${value || ''}`.trim().slice(0, 100)
    }

    _applyMemberKeyword(query, keyword) {
        if (!keyword) return query

        const pattern = `%${keyword}%`
        return query.where(function () {
            this.where('m.firstname', 'like', pattern)
                .orWhere('m.lastname', 'like', pattern)
                .orWhere('m.email', 'like', pattern)
                .orWhere('m.phone', 'like', pattern)
        })
    }

    _pointAwardQuery({ partnerId, period, keyword }) {
        const query = Database.from('point_histories as ph')
            .leftJoin('members as m', 'm.member_id', 'ph.member_id')
            .leftJoin('partners as p', 'p.partner_id', 'ph.partner_id')
            .whereNull('ph.deleted_at')
            .where('ph.source_type', 'partner_award')
            .where('ph.point', '>', 0)
            .where('ph.created_at', '>=', period.start)
            .where('ph.created_at', '<', period.end)

        if (partnerId) query.where('ph.partner_id', partnerId)
        return this._applyMemberKeyword(query, keyword)
    }

    _voucherSalesQuery({ partnerId, period, keyword }) {
        const query = Database.from('member_vouchers as mv')
            .leftJoin('members as m', 'm.member_id', 'mv.member_id')
            .leftJoin('partners as p', 'p.partner_id', 'mv.partner_id')
            .leftJoin('vouchers as v', 'v.voucher_id', 'mv.voucher_id')
            .whereNull('mv.deleted_at')
            .where('mv.created_at', '>=', period.start)
            .where('mv.created_at', '<', period.end)

        if (partnerId) query.where('mv.partner_id', partnerId)
        return this._applyMemberKeyword(query, keyword)
    }

    _paginationResult(data, page, rows, total) {
        return {
            data,
            page,
            perPage: rows,
            lastPage: Math.max(1, Math.ceil(total / rows)),
            total
        }
    }

    async pointAwards({ authUser, params = {} }) {
        const partnerId = await this._resolvePartnerScope(authUser, params.partner_id)
        const period = this._normalizePeriod(params)
        const pagination = this._normalizePagination(params)
        const keyword = this._normalizeKeyword(params.member_keyword)
        const queryContext = { partnerId, period, keyword }

        const summaryRows = await this._pointAwardQuery(queryContext)
            .select(
                Database.raw('COUNT(*) AS transaction_count'),
                Database.raw('COALESCE(SUM(ph.point), 0) AS total_points'),
                Database.raw('COUNT(DISTINCT ph.member_id) AS unique_members')
            )

        const summaryRow = summaryRows[0] || {}
        const summary = {
            transaction_count: Number(summaryRow.transaction_count || 0),
            total_points: Number(summaryRow.total_points || 0),
            unique_members: Number(summaryRow.unique_members || 0)
        }

        const rows = await this._pointAwardQuery(queryContext)
            .select(
                'ph.point_history_id',
                'ph.ref_id',
                'ph.point',
                'ph.desc',
                'ph.source_type',
                'ph.created_at',
                'ph.partner_id',
                'p.name as partner_name',
                'ph.member_id',
                'm.firstname',
                'm.lastname',
                'm.phone',
                'm.email'
            )
            .orderBy('ph.created_at', 'desc')
            .orderBy('ph.point_history_id', 'desc')
            .limit(pagination.rows)
            .offset(pagination.offset)

        return {
            period: {
                year: period.year,
                month: period.month,
                timezone: period.timezone
            },
            partner_id: partnerId,
            summary,
            rows: this._paginationResult(rows, pagination.page, pagination.rows, summary.transaction_count)
        }
    }

    async voucherSales({ authUser, params = {} }) {
        const partnerId = await this._resolvePartnerScope(authUser, params.partner_id)
        const period = this._normalizePeriod(params)
        const pagination = this._normalizePagination(params)
        const keyword = this._normalizeKeyword(params.member_keyword)
        const queryContext = { partnerId, period, keyword }

        const summaryRows = await this._voucherSalesQuery(queryContext)
            .select(
                Database.raw('COUNT(*) AS voucher_count'),
                Database.raw('COALESCE(SUM(COALESCE(mv.redeemed_point, 0)), 0) AS total_points'),
                Database.raw('COUNT(DISTINCT mv.member_id) AS unique_members')
            )

        const summaryRow = summaryRows[0] || {}
        const summary = {
            voucher_count: Number(summaryRow.voucher_count || 0),
            total_points: Number(summaryRow.total_points || 0),
            unique_members: Number(summaryRow.unique_members || 0)
        }

        const rows = await this._voucherSalesQuery(queryContext)
            .select(
                'mv.member_voucher_id',
                'mv.voucher_id',
                'mv.voucher_code',
                'mv.voucher_name_snapshot',
                'mv.redeemed_point',
                'mv.expire_date',
                'mv.used',
                'mv.created_at',
                'mv.partner_id',
                'p.name as partner_name',
                'v.name as current_voucher_name',
                'mv.member_id',
                'm.firstname',
                'm.lastname',
                'm.phone',
                'm.email'
            )
            .orderBy('mv.created_at', 'desc')
            .orderBy('mv.member_voucher_id', 'desc')
            .limit(pagination.rows)
            .offset(pagination.offset)

        return {
            period: {
                year: period.year,
                month: period.month,
                timezone: period.timezone
            },
            partner_id: partnerId,
            summary,
            rows: this._paginationResult(rows, pagination.page, pagination.rows, summary.voucher_count)
        }
    }
}

module.exports = new PartnerLoyaltyReportService()
