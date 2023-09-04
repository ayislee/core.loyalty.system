'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class RedeemMerchantsSchema extends Schema {
    up() {
        this.create('redeem_merchants', (table) => {
            table.increments('redeem_merchant_id')
            table.integer('partner_id').notNullable().unsigned().references('partner_id').inTable('partners')
            table.string('name').notNullable()
            table.text('address')
            table.string('lat')
            table.string('long')
            table.string('phone')
            table.timestamps()
            table.datetime('deleted_at')
        })
    }

    down() {
        this.drop('redeem_merchants')
    }
}

module.exports = RedeemMerchantsSchema
