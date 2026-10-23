'use strict'
const Route = use('Route')
Route.post('/api/v1/internal/wallet/payment-status', 'WalletSettlementController.paymentStatus')
