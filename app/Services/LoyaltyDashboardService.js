'use strict'

const Database = use('Database')
const moment = use('moment')

class LoyaltyDashboardService {
    _toPositiveInteger(value, fallback = null) {
        const parsed = parseInt(value, 10)
        return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
    }

    _normalizePeriod(year, month) {
        const now = moment()
        const y = this._toPositiveInteger(year, now.year())
        const m = this._toPositiveInteger(month, now.month() + 1)

        if (y < 2000 || y > 2100) throw new Error('year is invalid')
        if (m < 1 || m > 12) throw new Error('month is invalid')

        const start = moment(`${y}-${String(m).padStart(2, '0')}-01`, 'YYYY-MM-DD', true)
        if (!start.isValid()) throw new Error('period is invalid')

        return {
            year: y,
            month: m,
            timezone: 'Asia/Jakarta',
            start: start.startOf('day').format('YYYY-MM-DD HH:mm:ss'),
            end: start.clone().add(1, 'month').startOf('day').format('YYYY-MM-DD HH:mm:ss')
        }
    }

    async _resolvePartnerScope(authUser) {
        if (!authUser) throw new Error('Unauthorized')

        if (authUser.type === 'admin') {
            return { type: 'admin', partnerId: null, partnerName: 'Semua Partner' }
        }

        if (authUser.type !== 'partner') throw new Error('User is not allowed to access dashboard')

        const userPartner = await Database.from('user_partners as up')
            .join('partners as p', 'p.partner_id', 'up.partner_id')
            .where('up.user_id', authUser.user_id)
            .whereNull('up.deleted_at')
            .whereNull('p.deleted_at')
            .select('up.partner_id', 'p.name as partner_name')
            .first()

        if (!userPartner) throw new Error('Partner user is not linked to a partner')
        
        return { type: 'partner', partnerId: userPartner.partner_id, partnerName: userPartner.partner_name }
    }

    async getOverview({ authUser, year, month }) {
        const scope = await this._resolvePartnerScope(authUser)
        const period = this._normalizePeriod(year, month)

        // Summary - Members
        let membersQuery = Database.from('members').whereNull('deleted_at')
        if (scope.type === 'partner') {
            membersQuery.join('member_partners', 'member_partners.member_id', 'members.member_id')
                .where('member_partners.partner_id', scope.partnerId)
                .whereNull('member_partners.deleted_at')
        }

        const membersStats = await membersQuery.clone().select(
            Database.raw(`COUNT(DISTINCT members.member_id) as total_members`),
            Database.raw(`COUNT(DISTINCT CASE WHEN members.verified_phone = '1' OR members.verified_email = '1' THEN members.member_id END) as verified_members`),
            Database.raw(`COUNT(DISTINCT CASE WHEN members.status = 'active' THEN members.member_id END) as active_members`)
        ).first()

        // Summary - Points
        let pointsQuery = Database.from('point_histories')
            .whereNull('deleted_at')
            .where('source_type', 'partner_award')
            .where('point', '>', 0)
        if (scope.type === 'partner') {
            pointsQuery.where('partner_id', scope.partnerId)
        }
        const pointsStats = await pointsQuery.clone().sum('point as total_points_awarded').first()

        // Summary - Partners (Admin only)
        let total_partners = 0
        if (scope.type === 'admin') {
            const partnersStats = await Database.from('partners').whereNull('deleted_at').count('* as total_partners').first()
            total_partners = Number(partnersStats.total_partners || 0)
        }

        // Summary - Vouchers Created & Active
        let vouchersQuery = Database.from('vouchers').whereNull('deleted_at')
        if (scope.type === 'partner') {
            vouchersQuery.where('partner_id', scope.partnerId)
        }
        const vouchersStats = await vouchersQuery.clone().select(
            Database.raw(`COUNT(*) as total_vouchers_created`),
            Database.raw(`COUNT(CASE WHEN status = 'active' THEN 1 END) as active_vouchers`)
        ).first()

        // Summary - Vouchers Sold
        let soldVouchersQuery = Database.from('member_vouchers').whereNull('deleted_at')
        if (scope.type === 'partner') {
            soldVouchersQuery.where('partner_id', scope.partnerId)
        }
        const soldVouchersStats = await soldVouchersQuery.clone().count('* as sold_vouchers').first()

        // Summary - Vouchers Redeemed
        let redeemedVouchersQuery = Database.from('voucher_exchanges')
            .join('member_vouchers', 'member_vouchers.member_voucher_id', 'voucher_exchanges.member_voucher_id')
            .whereNull('member_vouchers.deleted_at')
            .where('voucher_exchanges.lifecycle_status', 'exchanged')
        if (scope.type === 'partner') {
            redeemedVouchersQuery.where('member_vouchers.partner_id', scope.partnerId)
        }
        const redeemedVouchersStats = await redeemedVouchersQuery.clone()
            .select(Database.raw('COUNT(DISTINCT voucher_exchanges.member_voucher_id) as redeemed_vouchers'))
            .first()


        // Recent Members
        let recentMembersQuery = Database.from('members')
            .select('members.member_id', 'members.firstname', 'members.lastname', 'members.email', 'members.phone', 'members.created_at')
            .whereNull('members.deleted_at')
            .orderBy('members.created_at', 'desc')
            .orderBy('members.member_id', 'desc')
            .limit(10)

        if (scope.type === 'partner') {
            recentMembersQuery.join('member_partners', 'member_partners.member_id', 'members.member_id')
                .where('member_partners.partner_id', scope.partnerId)
                .whereNull('member_partners.deleted_at')
                .groupBy('members.member_id', 'members.firstname', 'members.lastname', 'members.email', 'members.phone', 'members.created_at')
        }
        const recent_members = await recentMembersQuery

        // Recent Point History
        let recentPointsQuery = Database.from('point_histories')
            .leftJoin('members', 'members.member_id', 'point_histories.member_id')
            .leftJoin('partners', 'partners.partner_id', 'point_histories.partner_id')
            .select('point_histories.point_history_id', 'point_histories.member_id', 'members.firstname as member_firstname', 'members.lastname as member_lastname', 'point_histories.partner_id', 'partners.name as partner_name', 'point_histories.point', 'point_histories.desc', 'point_histories.source_type', 'point_histories.created_at')
            .whereNull('point_histories.deleted_at')
            .orderBy('point_histories.created_at', 'desc')
            .orderBy('point_histories.point_history_id', 'desc')
            .limit(10)

        if (scope.type === 'partner') {
            recentPointsQuery.where('point_histories.partner_id', scope.partnerId)
        }
        const recent_point_history = await recentPointsQuery


        // Recent Redeemed Vouchers
        let recentRedeemedQuery = Database.from('voucher_exchanges')
            .join('member_vouchers', 'member_vouchers.member_voucher_id', 'voucher_exchanges.member_voucher_id')
            .leftJoin('members', 'members.member_id', 'member_vouchers.member_id')
            .leftJoin('partners', 'partners.partner_id', 'member_vouchers.partner_id')
            .select('member_vouchers.member_voucher_id', 'member_vouchers.voucher_name_snapshot', 'member_vouchers.member_id', 'members.firstname as member_firstname', 'members.lastname as member_lastname', 'member_vouchers.partner_id', 'partners.name as partner_name', Database.raw('COALESCE(voucher_exchanges.exchanged_at, voucher_exchanges.created_at) as exchanged_at'))
            .whereNull('member_vouchers.deleted_at')
            .where('voucher_exchanges.lifecycle_status', 'exchanged')
            .orderByRaw('COALESCE(voucher_exchanges.exchanged_at, voucher_exchanges.created_at) desc')
            .orderBy('voucher_exchanges.voucher_exchange_id', 'desc')
            .limit(10)

        if (scope.type === 'partner') {
            recentRedeemedQuery.where('member_vouchers.partner_id', scope.partnerId)
        }
        const recent_redeemed_vouchers = await recentRedeemedQuery

        // Voucher Sales per Partner per Month
        let salesQuery = Database.from('member_vouchers')
            .leftJoin('partners', 'partners.partner_id', 'member_vouchers.partner_id')
            .select(
                'member_vouchers.partner_id', 
                Database.raw("COALESCE(partners.name, 'Partner tidak diketahui') as partner_name"),
                Database.raw('COUNT(*) as sold_vouchers'),
                Database.raw('COALESCE(SUM(COALESCE(member_vouchers.redeemed_point, 0)), 0) as total_points'),
                Database.raw('COUNT(DISTINCT member_vouchers.member_id) as unique_buyers')
            )
            .whereNull('member_vouchers.deleted_at')
            .where('member_vouchers.created_at', '>=', period.start)
            .where('member_vouchers.created_at', '<', period.end)
            .groupBy('member_vouchers.partner_id', 'partners.name')
            .orderBy('sold_vouchers', 'desc')

        if (scope.type === 'partner') {
            salesQuery.where('member_vouchers.partner_id', scope.partnerId)
        }
        
        const voucher_sales_data = await salesQuery

        let salesTotalQuery = Database.from('member_vouchers')
            .whereNull('deleted_at')
            .where('created_at', '>=', period.start)
            .where('created_at', '<', period.end)
        if (scope.type === 'partner') salesTotalQuery.where('partner_id', scope.partnerId)
        const salesTotalRow = await salesTotalQuery.select(
            Database.raw('COUNT(*) as sold_vouchers'),
            Database.raw('COALESCE(SUM(COALESCE(redeemed_point, 0)), 0) as total_points'),
            Database.raw('COUNT(DISTINCT member_id) as unique_buyers')
        ).first()
        const sales_total = {
            sold_vouchers: Number(salesTotalRow?.sold_vouchers || 0),
            total_points: Number(salesTotalRow?.total_points || 0),
            unique_buyers: Number(salesTotalRow?.unique_buyers || 0)
        }

        return {
            scope: {
                type: scope.type,
                partner_id: scope.partnerId,
                partner_name: scope.partnerName
            },
            summary: {
                total_members: Number(membersStats?.total_members || 0),
                verified_members: Number(membersStats?.verified_members || 0),
                active_members: Number(membersStats?.active_members || 0),
                total_points_awarded: Number(pointsStats?.total_points_awarded || 0),
                total_partners: total_partners,
                total_vouchers_created: Number(vouchersStats?.total_vouchers_created || 0),
                active_vouchers: Number(vouchersStats?.active_vouchers || 0),
                sold_vouchers: Number(soldVouchersStats?.sold_vouchers || 0),
                redeemed_vouchers: Number(redeemedVouchersStats?.redeemed_vouchers || 0)
            },
            recent_members,
            recent_point_history,
            recent_redeemed_vouchers,
            voucher_sales: {
                period: {
                    year: period.year,
                    month: period.month,
                    timezone: period.timezone
                },
                sales: voucher_sales_data,
                total: sales_total
            }
        }
    }
}

module.exports = new LoyaltyDashboardService()

