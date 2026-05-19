'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AddCoordinateToAddressesSchema extends Schema {
  up () {
    this.table('addresses', (table) => {
      table.string('coordinate').nullable()
    })
  }

  down () {
    this.table('addresses', (table) => {
      table.dropColumn('coordinate')
    })
  }
}

module.exports = AddCoordinateToAddressesSchema
