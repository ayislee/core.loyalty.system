'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TransactionSchema extends Schema {
    up() {
        this.create('transactions', (table) => {
            table.increments('transaction_id')
            table.integer('member_id').unsigned().notNullable()
            table.longtext('request')
            table.string('url')
            table.longtext('response')
            
            table.timestamps()
        })
    }

    down() {
        this.drop('transactions')
    }
}

module.exports = TransactionSchema
