'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class VoucherExchangeSchema extends Schema {
    up() {
        this.table('voucher_exchanges', (table) => {
            // alter table
            table.unique(['member_voucher_id','redeem_merchant_id'])
        })
    }

    down() {
        this.table('voucher_exchanges', (table) => {
            // reverse alternations
        })
    }
}

module.exports = VoucherExchangeSchema
