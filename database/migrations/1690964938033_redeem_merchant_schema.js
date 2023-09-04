'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class RedeemMerchantSchema extends Schema {
    up() {
        this.table('redeem_merchants', (table) => {
            // alter table
            table.string('image')
        })
    }

    down() {
        this.table('redeem_merchants', (table) => {
            // reverse alternations
        })
    }
}

module.exports = RedeemMerchantSchema
