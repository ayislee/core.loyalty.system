'use strict'

const Member = use('App/Models/Member')
const Point = use('App/Models/Point')
const PointHistory = use('App/Models/PointHistory')
const MemberVoucher = use('App/Models/MemberVoucher')
const Transaction = use('App/Models/Transaction')
const LoyaltyDashboardService = use('App/Services/LoyaltyDashboardService')

class DashboardController {
    async overview({ auth, request, response }) {
        try {
            const authUser = auth.user
            const { year, month } = request.all()
            const data = await LoyaltyDashboardService.getOverview({ authUser, year, month })
            return response.json({ status: true, data })
        } catch (error) {
            const message = error.message || 'Failed to load loyalty dashboard'
            const status = message === 'Unauthorized' || message.includes('not allowed') || message.includes('not linked') ? 403 : 400
            return response.status(status).json({ status: false, message })
        }
    }

    _ensureAdmin(auth) {
        if (!auth.user || auth.user.type !== 'admin') {
            throw new Error('Access denied. Admin only.')
        }
    }

    async stats({ auth, response }) {
        try {
            this._ensureAdmin(auth)
            const totalMembers = await Member.getCount()
            const totalPoints = await Point.query().sum('point as total')
            const totalVouchers = await MemberVoucher.getCount()
            const totalTransactions = await Transaction.getCount()

            return response.json({
                status: true,
                data: {
                    total_members: totalMembers,
                    total_points: totalPoints[0].total || 0,
                    total_vouchers: totalVouchers,
                    total_transactions: totalTransactions
                }
            })
        } catch (e) {
            return response.status(403).json({ status: false, message: e.message })
        }
    }

    async recentMembers({ auth, response }) {
        try {
            this._ensureAdmin(auth)
            const members = await Member.query()
                .orderBy('created_at', 'desc')
                .limit(5)
                .fetch()

            return response.json({ status: true, data: members })
        } catch (e) {
            return response.status(403).json({ status: false, message: e.message })
        }
    }

    async pointHistory({ auth, response }) {
        try {
            this._ensureAdmin(auth)
            const history = await PointHistory.query()
                .with('member')
                .orderBy('created_at', 'desc')
                .limit(10)
                .fetch()

            return response.json({ status: true, data: history })
        } catch (e) {
            return response.status(403).json({ status: false, message: e.message })
        }
    }

    async voucherUsage({ auth, response }) {
        try {
            this._ensureAdmin(auth)
            const vouchers = await MemberVoucher.query()
                .with('voucher')
                .with('member')
                .orderBy('created_at', 'desc')
                .limit(10)
                .fetch()

            return response.json({ status: true, data: vouchers })
        } catch (e) {
            return response.status(403).json({ status: false, message: e.message })
        }
    }

    async transactions({ auth, response }) {
        try {
            this._ensureAdmin(auth)
            const transactions = await Transaction.query()
                .with('member')
                .orderBy('created_at', 'desc')
                .limit(10)
                .fetch()

            return response.json({ status: true, data: transactions })
        } catch (e) {
            return response.status(403).json({ status: false, message: e.message })
        }
    }
}

module.exports = DashboardController
