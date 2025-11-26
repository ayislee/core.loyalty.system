'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AddStoreToCartSchema extends Schema {
  up () {
    this.table('carts', (table) => {
      table.string('store_slug').nullable().index()
      table.string('store_name').nullable()
    })
  }

  down () {
    this.table('carts', (table) => {
      table.dropColumn('store_slug')
      table.dropColumn('store_name')
    })
  }
}

module.exports = AddStoreToCartSchema
