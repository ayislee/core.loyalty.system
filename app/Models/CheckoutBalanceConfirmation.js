'use strict'
const Model = use('Model')
class CheckoutBalanceConfirmation extends Model { static get table () { return 'checkout_balance_confirmations' }; static get primaryKey () { return 'checkout_balance_confirmation_id' } }
module.exports = CheckoutBalanceConfirmation
