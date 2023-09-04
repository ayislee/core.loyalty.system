'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class UserPartnerSchema extends Schema {
    up() {
        this.table('user_partners', (table) => {
            table.unique(['user_id','partner_id'])
        })
    }

    down() {
        this.table('user_partners', (table) => {
            // reverse alternations
        })
    }
}

module.exports = UserPartnerSchema
