'use strict'

const PartnerLoyaltyReportService = use('App/Services/PartnerLoyaltyReportService')

class PartnerLoyaltyReportController {
    async pointAwards({ request, response, auth }) {
        try {
            const data = await PartnerLoyaltyReportService.pointAwards({
                authUser: auth.user,
                params: request.all()
            })

            return response.json({ status: true, data })
        } catch (error) {
            return response.json({
                status: false,
                message: error.message || 'Failed to fetch point award report'
            })
        }
    }

    async voucherSales({ request, response, auth }) {
        try {
            const data = await PartnerLoyaltyReportService.voucherSales({
                authUser: auth.user,
                params: request.all()
            })

            return response.json({ status: true, data })
        } catch (error) {
            return response.json({
                status: false,
                message: error.message || 'Failed to fetch voucher sales report'
            })
        }
    }
}

module.exports = PartnerLoyaltyReportController
