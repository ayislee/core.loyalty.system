'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class MemberSchema extends Schema {
    up() {
        this.table('members', (table) => {
            // alter table
            table.integer('default_partner_id').unsigned()
        })
    }

    down() {
        this.table('members', (table) => {
            // reverse alternations
        })
    }
}

module.exports = MemberSchema
