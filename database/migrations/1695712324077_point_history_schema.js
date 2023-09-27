'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class PointHistorySchema extends Schema {
    up() {
        this.table('point_histories', (table) => {
            // alter table
            table.integer('partner_id').unsigned()
        })
    }

    down() {
        this.table('point_histories', (table) => {
            // reverse alternations
        })
    }
}

module.exports = PointHistorySchema
