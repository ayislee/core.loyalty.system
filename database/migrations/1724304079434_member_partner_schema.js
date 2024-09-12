'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class MemberPartnerSchema extends Schema {
    up() {
        this.table('member_partners', (table) => {
            // alter table
            table.unique(['partner_id','member_id'])
        })
    }

    down() {
        this.table('member_partners', (table) => {
            // reverse alternations
        })
    }
}

module.exports = MemberPartnerSchema
