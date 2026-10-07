'use strict'

const Schema = use('Schema')

class AddCartV2ContextToCartsSchema extends Schema {
  up () {
    this.table('carts', (table) => {
      table.integer('store_id').unsigned().nullable().index()
      table.string('company_slug', 255).nullable().index()
      table.decimal('unit_price_snapshot', 15, 2).nullable()
      table.datetime('price_checked_at').nullable()
      table.index(['member_id', 'store_slug', 'menu_id'], 'carts_member_store_menu_index')
    })
  }

  down () {
    this.table('carts', (table) => {
      table.dropIndex(['member_id', 'store_slug', 'menu_id'], 'carts_member_store_menu_index')
      table.dropColumn('price_checked_at')
      table.dropColumn('unit_price_snapshot')
      table.dropColumn('company_slug')
      table.dropColumn('store_id')
    })
  }
}

module.exports = AddCartV2ContextToCartsSchema
