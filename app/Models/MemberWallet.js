'use strict'
const Model = use('Model')

class MemberWallet extends Model {
    static get table () { return 'member_wallets' }
    static get primaryKey () { return 'wallet_id' }
    static boot () { super.boot(); this.addTrait('Filter'); this.addTrait('OrderBy') }
    ledgerEntries () { return this.hasMany('App/Models/WalletLedgerEntry', 'wallet_id', 'wallet_id') }
    holds () { return this.hasMany('App/Models/WalletHold', 'wallet_id', 'wallet_id') }
}
module.exports = MemberWallet
