'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class PartnerSchema extends Schema {
    up() {
        this.create('partners', (table) => {
            table.increments('partner_id')
            table.string('name')
            table.string('client_id')
            table.string('server_id')
            table.timestamps()
            table.datetime('deleted_at')
        })
    }

    down() {
        this.drop('partners')
    }
}

module.exports = PartnerSchema
