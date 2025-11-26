'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class ProductReviewSchema extends Schema {
  up () {
    this.create('product_reviews', (table) => {
      table.increments('review_id')
      table.integer('item_id').unsigned().notNullable().index()
      table.integer('member_id').unsigned().nullable().index()
      table.integer('rating').unsigned().notNullable().comment('1-5 bintang')
      table.text('comment').nullable()
      table.timestamps()
    })
  }

  down () {
    this.drop('product_reviews')
  }
}

module.exports = ProductReviewSchema
