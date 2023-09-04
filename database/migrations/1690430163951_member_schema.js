'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class MemberSchema extends Schema {
    up() {
        this.create('members', (table) => {
            table.increments('member_id')
            table.string('lid')
            table.string('phone', 25).notNullable().unique()
            table.string('email', 254).unique()
            table.enu('verified_email',['0','1']).defaultTo('0')
            table.string('password', 60)

            table.string('firstname', 80)
            table.string('lastname', 80)
            table.string('token', 80)
            table.datetime('token_valid_until')

            table.string('image_profile')
            table.enu('status',['active','not active','suspend']).defaultTo('not active')

            table.timestamps()
            table.datetime('deleted_at')
        })
    }

    down() {
        this.drop('members')
    }
}

module.exports = MemberSchema
