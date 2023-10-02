'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class MemberVoucherSchema extends Schema {
    up() {
        this.table('member_vouchers', (table) => {
            // alter table
            table.decimal('amount',12,2).unsigned()
        })
    }

    down() {
        this.table('member_vouchers', (table) => {
            // reverse alternations
        })
    }
}

module.exports = MemberVoucherSchema
