'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class PartnerSchema extends Schema {
    up() {
        this.table('partners', (table) => {
            // alter table
            table.json('store_slug')
        })
    }

    down() {
        this.table('partners', (table) => {
            // reverse alternations
        })
    }
}

module.exports = PartnerSchema
