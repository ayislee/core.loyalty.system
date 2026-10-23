'use strict'

const Schema = use('Schema')

class WithdrawalConfirmationSchema extends Schema {
    up () {
        this.create('withdrawal_confirmations', (table) => {
            table.increments('withdrawal_confirmation_id')
            table.integer('member_id').unsigned().notNullable().index()
            table.string('client_request_id', 191).notNullable()
            table.longText('payload_encrypted').notNullable()
            table.string('token', 255).notNullable()
            table.dateTime('token_valid_until').notNullable().index()
            table.enu('status', ['pending', 'verified', 'expired', 'cancelled']).notNullable().defaultTo('pending')
            table.timestamps()
            table.unique(['member_id', 'client_request_id'])
            table.index(['member_id', 'status'])
        })
    }

    down () { this.drop('withdrawal_confirmations') }
}

module.exports = WithdrawalConfirmationSchema
