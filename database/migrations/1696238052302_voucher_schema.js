'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class VoucherSchema extends Schema {
    up() {
        this.table('vouchers', (table) => {
            // alter table
            table.enu('type',['free','amount']).defaultTo('free')
        })
    }

    down() {
        this.table('vouchers', (table) => {
            // reverse alternations
        })
    }
}

module.exports = VoucherSchema
