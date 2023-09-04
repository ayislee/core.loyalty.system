'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class VoucherExchangeSchema extends Schema {
    up() {
        this.create('voucher_exchanges', (table) => {
            table.increments('voucher_exchange_id')
            table.string('reff').unique()
            table.integer('member_voucher_id').unsigned().notNullable().references('member_voucher_id').inTable('member_vouchers')
            table.integer('redeem_merchant_id').unsigned().notNullable().references('redeem_merchant_id').inTable('redeem_merchants')
            table.string('note')
            table.timestamps()
            
        })
    }

    down() {
        this.drop('voucher_exchanges')
    }
}

module.exports = VoucherExchangeSchema
