'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class VoucherDiscountSchema extends Schema {
    up() {
        this.table('vouchers', (table) => {
            table.enu('discount_calculation_type', ['fixed_amount', 'percentage']).nullable()
            table.decimal('discount_value', 12, 2).unsigned().nullable()
        })
    }

    down() {
        this.table('vouchers', (table) => {
            table.dropColumn('discount_calculation_type')
            table.dropColumn('discount_value')
        })
    }
}

module.exports = VoucherDiscountSchema
