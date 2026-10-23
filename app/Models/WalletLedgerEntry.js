'use strict'
const Model = use('Model')
class WalletLedgerEntry extends Model {
    static get table () { return 'wallet_ledger_entries' }
    static get primaryKey () { return 'ledger_entry_id' }
}
module.exports = WalletLedgerEntry
