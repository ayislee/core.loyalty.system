'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class MemberPartnerSchema extends Schema {
    up() {
        this.create('member_partners', (table) => {
            table.increments('member_partner_id')
            table.integer('member_id').unsigned().notNullable().references('user_id').inTable('users')
            table.integer('partner_id').unsigned().notNullable().references('partner_id').inTable('partners')
            table.timestamps()
            table.datetime('deleted_at')
        })
    }

    down() {
        this.drop('member_partners')
    }
}

module.exports = MemberPartnerSchema
