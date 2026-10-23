'use strict'
const Model = use('Model')
class TransactionRefund extends Model {
    static get table () { return 'transaction_refunds' }
    static get primaryKey () { return 'transaction_refund_id' }
}
module.exports = TransactionRefund
