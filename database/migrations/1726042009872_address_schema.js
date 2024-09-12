'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AddressSchema extends Schema {
    up() {
        this.create('addresses', (table) => {
            table.increments('address_id')
            table.integer('member_id').unsigned().notNullable()
            table.string('address_name').notNullable()
            table.integer('province_id').notNullable().unsigned()
            table.string('province_name').notNullable()
            table.integer('city_id').notNullable().unsigned()
            table.string('city_type').notNullable()
            table.string('city_name').notNullable()

            table.text('full_address').notNullable()
            table.integer('postal_code').notNullable().unsigned()
            table.enum('address_default',['0','1']).defaultTo('0')

            table.timestamps()
        })
    }

    down() {
        this.drop('addresses')
    }
}

module.exports = AddressSchema
