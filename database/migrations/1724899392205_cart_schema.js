'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class CartSchema extends Schema {
    up() {
        this.create('carts', (table) => {
            table.increments('cart_id')
            table.integer('member_id').unsigned().notNullable()
            table.integer('item_id').unsigned().notNullable()
            table.string('item_name').notNullable()
            table.integer('quantity').unsigned().notNullable().defaultTo()
            table.text('note')
            table.string('item_image')
            table.string('menu_slug')
            table.enum('checked',['0','1']).defaultTo('0')
            table.timestamps()
        })
    }

    down() {
        this.drop('carts')
    }
}

module.exports = CartSchema
