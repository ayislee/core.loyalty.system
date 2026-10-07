'use strict'
const Schema = use('Schema')

class AddTargetMenuIdToPromoBanners extends Schema {
  up () { this.table('promo_banners', (table) => table.integer('target_menu_id').unsigned().nullable().after('target_item_id')) }
  down () { this.table('promo_banners', (table) => table.dropColumn('target_menu_id')) }
}

module.exports = AddTargetMenuIdToPromoBanners
