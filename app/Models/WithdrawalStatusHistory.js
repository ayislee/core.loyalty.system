'use strict'
const Model = use('Model')
class WithdrawalStatusHistory extends Model {
    static get table () { return 'withdrawal_status_histories' }
    static get primaryKey () { return 'withdrawal_status_history_id' }
}
module.exports = WithdrawalStatusHistory
