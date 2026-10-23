'use strict'
const Model = use('Model')
class Withdrawal extends Model {
    static get table () { return 'withdrawals' }
    static get primaryKey () { return 'withdrawal_id' }
    statusHistories () { return this.hasMany('App/Models/WithdrawalStatusHistory', 'withdrawal_id', 'withdrawal_id') }
    member () { return this.belongsTo('App/Models/Member', 'member_id', 'member_id') }
}
module.exports = Withdrawal
