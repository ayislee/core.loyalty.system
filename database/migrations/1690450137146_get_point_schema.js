'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class GetPointSchema extends Schema {
    up() {
        this.create('get_points', (table) => {
            table.increments('get_point_id')
            table.integer('partner_id').notNullable().unsigned().references('partner_id').inTable('partners')
            table.string('name').notNullable()
            table.string('code').notNullable()
            table.string('desc').notNullable()
            table.decimal('point_receive',12,2)
            table.timestamps()
            table.unique(['partner_id','code'])
            table.datetime('deleted_at')

        })
    }

    down() {
        this.drop('get_points')
    }
}

module.exports = GetPointSchema
