'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class UserPartnerSchema extends Schema {
    up() {
        this.create('user_partners', (table) => {
            table.increments('user_partner_id')
            table.integer('user_id').unsigned().notNullable().references('user_id').inTable('users')
            table.integer('partner_id').unsigned().notNullable().references('partner_id').inTable('partners')
            table.timestamps()
            table.datetime('deleted_at')
        })
    }

    down() {
        this.drop('user_partners')
    }
}

module.exports = UserPartnerSchema
