'use strict'
const Route = use('Route')

Route.group(() => {
    Route.get('/', 'RefundController.list')
    Route.get('/:id', 'RefundController.detail')
    Route.post('/', 'RefundController.create')
    Route.post('/:id/approve', 'RefundController.approve')
    Route.post('/:id/reject', 'RefundController.reject')
}).prefix('/api/v1/admin/refunds').middleware(['auth:jwt', 'FinanceOnly'])
