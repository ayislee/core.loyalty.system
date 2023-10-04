'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class RedeemMerchantSchema extends Schema {
    up() {
        this.table('redeem_merchants', (table) => {
            // alter table
            table.string('store_id')
            table.unique(['store_id','partner_id'])
        })
    }

    down() {
        this.table('redeem_merchants', (table) => {
            // reverse alternations
        })
    }
}

module.exports = RedeemMerchantSchema
