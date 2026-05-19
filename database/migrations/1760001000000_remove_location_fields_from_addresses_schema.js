'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class RemoveLocationFieldsFromAddressesSchema extends Schema {
  up () {
    this.table('addresses', (table) => {
      table.dropColumn('province_id')
      table.dropColumn('province_name')
      table.dropColumn('city_id')
      table.dropColumn('city_type')
      table.dropColumn('city_name')
      table.dropColumn('postal_code')
    })
  }

  down () {
    this.table('addresses', (table) => {
      table.integer('province_id').unsigned().nullable()
      table.string('province_name').nullable()
      table.integer('city_id').unsigned().nullable()
      table.string('city_type').nullable()
      table.string('city_name').nullable()
      table.integer('postal_code').unsigned().nullable()
    })
  }
}

module.exports = RemoveLocationFieldsFromAddressesSchema
