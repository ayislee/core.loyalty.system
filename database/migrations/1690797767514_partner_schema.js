'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class PartnerSchema extends Schema {
    up() {
        this.table('partners', (table) => {
            // alter table
            table.unique(['name'])
        })
    }

    down() {
        this.table('partners', (table) => {
            // reverse alternations
        })
    }
}

module.exports = PartnerSchema
