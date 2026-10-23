'use strict'

const Model = use('Model')

class WithdrawalConfirmation extends Model {
    static get table () { return 'withdrawal_confirmations' }
    static get primaryKey () { return 'withdrawal_confirmation_id' }
}

module.exports = WithdrawalConfirmation
