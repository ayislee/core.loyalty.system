'use strict'

const Route = use('Route')

Route.group(() => {
    Route.get('/point-awards', 'PartnerLoyaltyReportController.pointAwards')
    Route.get('/voucher-sales', 'PartnerLoyaltyReportController.voucherSales')
}).prefix('/api/v1/admin/reports').middleware(['auth:jwt'])
