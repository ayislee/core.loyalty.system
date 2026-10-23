'use strict'
const Schema = use('Schema')

class CheckoutBalanceConfirmations extends Schema {
    async up () {
        const exists = await this.hasTable('checkout_balance_confirmations')
        if (!exists) {
            this.create('checkout_balance_confirmations', (t) => {
                t.increments('checkout_balance_confirmation_id')
                t.integer('member_id').unsigned().notNullable().index()
                t.longText('quote_token').notNullable()
                t.string('client_request_id', 191).notNullable()
                t.string('token', 255).notNullable()
                t.dateTime('expires_at').notNullable()
                t.enu('status', ['pending', 'verified', 'expired']).defaultTo('pending')
                t.timestamps()
                t.unique(['member_id', 'client_request_id'], 'cbc_member_client_uq')
            })
            return
        }
        this.table('checkout_balance_confirmations', (t) => t.unique(['member_id', 'client_request_id'], 'cbc_member_client_uq'))
    }
    down () { this.drop('checkout_balance_confirmations') }
}

module.exports = CheckoutBalanceConfirmations
