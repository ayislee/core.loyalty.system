'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class VoucherPartnerSchema extends Schema {
    up() {
        this.create('voucher_partners', (table) => {
            table.increments('voucher_partner_id')
            table.timestamps()
        })
    }

    down() {
        this.drop('voucher_partners')
    }
}

module.exports = VoucherPartnerSchema
