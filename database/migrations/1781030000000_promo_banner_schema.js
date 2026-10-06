'use strict'
const Schema = use('Schema')
class PromoBannerSchema extends Schema {
  up () { this.create('promo_banners', (t) => { t.increments('promo_banner_id'); t.string('title', 150); t.string('image_url', 500); t.enu('status', ['active','inactive']).defaultTo('inactive').index(); t.datetime('start_at').index(); t.datetime('end_at').index(); t.integer('display_order').unsigned().defaultTo(0).index(); t.enu('scope_type',['all','partner']).defaultTo('all'); t.integer('partner_id').unsigned().nullable().index(); t.enu('target_type',['none','product','internal_url','external_url']).defaultTo('none'); t.integer('target_item_id').unsigned().nullable(); t.string('target_item_slug', 255).nullable(); t.string('target_url', 500).nullable(); t.integer('created_by').unsigned().nullable(); t.integer('updated_by').unsigned().nullable(); t.timestamps() }) }
  down () { this.drop('promo_banners') }
}
module.exports = PromoBannerSchema
