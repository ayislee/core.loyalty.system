'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class MemberContactVerificationSchema extends Schema {
    up() {
        this.table('members', (table) => {
            table.enu('verified_phone', ['0', '1']).defaultTo('0')
        })

        this.create('member_contact_verifications', (table) => {
            table.increments('member_contact_verification_id')
            table.integer('member_id').unsigned().notNullable().references('member_id').inTable('members')
            table.enu('type', ['email', 'phone']).notNullable()
            table.string('target', 254).notNullable()
            table.string('token', 80).notNullable()
            table.datetime('token_valid_until').notNullable()
            table.enu('status', ['pending', 'verified', 'expired', 'cancelled']).defaultTo('pending')
            table.timestamps()
            table.datetime('deleted_at')

            table.index(['member_id', 'type', 'status'])
            table.index(['type', 'target', 'status'])
            table.index(['token_valid_until'])
        })
    }

    down() {
        this.drop('member_contact_verifications')

        this.table('members', (table) => {
            table.dropColumn('verified_phone')
        })
    }
}

module.exports = MemberContactVerificationSchema
