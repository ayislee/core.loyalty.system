'use strict'
const Schema = use('Schema')

class AddMenuIdToCartsSchema extends Schema {
  up () { this.table('carts', (table) => table.integer('menu_id').unsigned().nullable().after('item_id').index()) }
  down () { this.table('carts', (table) => table.dropColumn('menu_id')) }
}

module.exports = AddMenuIdToCartsSchema
