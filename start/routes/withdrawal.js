'use strict'
const Route = use('Route')

Route.group(() => {
    Route.get('/', 'AdminWithdrawalController.list')
    Route.get('/:id', 'AdminWithdrawalController.detail')
    Route.post('/:id/:action', 'AdminWithdrawalController.action')
}).prefix('/api/v1/admin/withdrawals').middleware(['auth:jwt', 'FinanceOnly'])
