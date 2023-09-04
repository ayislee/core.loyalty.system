'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class PointSchema extends Schema {
    up() {
        this.create('points', (table) => {
            table.increments('point_id')
            table.integer('member_id').unique().notNullable().unsigned().references('member_id').inTable('members')
            table.decimal('point',12,2).unsigned().defaultTo(0)
            table.enu('status',['active','suspend']).defaultTo('active').notNullable()
            table.timestamps()
            table.datetime('deleted_at')
        })
    }

    down() {
        this.drop('points')
    }
}

module.exports = PointSchema
