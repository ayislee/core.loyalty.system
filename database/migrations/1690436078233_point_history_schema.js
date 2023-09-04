'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class PointHistorySchema extends Schema {
    up() {
        this.create('point_histories', (table) => {
            table.increments('point_history_id')
            table.integer('member_id')
            table.string('ref_id')
            table.string('desc')
            table.decimal('point',12,2).notNullable()
            table.timestamps()
            table.datetime('deleted_at')
        })
    }

    down() {
        this.drop('point_histories')
    }
}

module.exports = PointHistorySchema
