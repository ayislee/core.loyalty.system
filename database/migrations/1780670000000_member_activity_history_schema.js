'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class MemberActivityHistorySchema extends Schema {
    up() {
        this.create('member_activity_histories', (table) => {
            table.increments('member_activity_history_id')
            table.integer('member_id').unsigned().notNullable().references('member_id').inTable('members')
            table.string('activity_type', 80).notNullable()
            table.string('ip_address', 45).nullable()
            table.text('user_agent').nullable()
            table.string('description', 255).nullable()
            table.text('metadata').nullable()
            table.timestamps()
            table.datetime('deleted_at')

            table.index(['member_id', 'activity_type'])
            table.index(['member_id', 'created_at'])
        })
    }

    down() {
        this.drop('member_activity_histories')
    }
}

module.exports = MemberActivityHistorySchema
