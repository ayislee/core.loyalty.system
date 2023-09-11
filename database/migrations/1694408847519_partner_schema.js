'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class PartnerSchema extends Schema {
    up() {
        this.table('partners', (table) => {
            // alter table
            table.string('logo')
            table.text('desc')
            table.text('howtogetpoint')
        })
    }

    down() {
        this.table('partners', (table) => {
            // reverse alternations
        })
    }
}

module.exports = PartnerSchema
