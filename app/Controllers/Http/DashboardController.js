'use strict'

const Member = use('App/Models/Member')
const Point = use('App/Models/Point')
const PointHistory = use('App/Models/PointHistory')
const MemberVoucher = use('App/Models/MemberVoucher')
const Transaction = use('App/Models/Transaction')
const Database = use('Database')

class DashboardController {
    async stats({ response }) {
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
    }

    async recentMembers({ request, response }) {
        const members = await Member.query()
            .orderBy('created_at', 'desc')
            .limit(5)
            .fetch()

        return response.json({
            status: true,
            data: members
        })
    }

    async pointHistory({ request, response }) {
        const history = await PointHistory.query()
            .with('member')
            .orderBy('created_at', 'desc')
            .limit(10)
            .fetch()

        return response.json({
            status: true,
            data: history
        })
    }

    async voucherUsage({ request, response }) {
        const vouchers = await MemberVoucher.query()
            .with('voucher')
            .with('member')
            .orderBy('created_at', 'desc')
            .limit(10)
            .fetch()

        return response.json({
            status: true,
            data: vouchers
        })
    }

    async transactions({ request, response }) {
        const transactions = await Transaction.query()
            .with('member')
            .orderBy('created_at', 'desc')
            .limit(10)
            .fetch()

        return response.json({
            status: true,
            data: transactions
        })
    }
}

module.exports = DashboardController