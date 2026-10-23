'use strict'
const Model = use('Model')
class WalletHold extends Model {
    static get table () { return 'wallet_holds' }
    static get primaryKey () { return 'wallet_hold_id' }
}
module.exports = WalletHold
