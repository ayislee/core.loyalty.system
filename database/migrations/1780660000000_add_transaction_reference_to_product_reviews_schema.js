'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AddTransactionReferenceToProductReviewsSchema extends Schema {
  up () {
    this.table('product_reviews', (table) => {
      table.integer('transaction_id').unsigned().nullable().index()
      table.string('transaction_number', 100).nullable().index()
      table.integer('transaction_detail_id').unsigned().nullable().index()
      table.unique(
        ['member_id', 'item_id', 'transaction_number'],
        'product_reviews_member_item_transaction_unique'
      )
      table.unique(
        ['member_id', 'item_id', 'transaction_id'],
        'product_reviews_member_item_transaction_id_unique'
      )
    })
  }

  down () {
    this.table('product_reviews', (table) => {
      table.dropUnique(
        ['member_id', 'item_id', 'transaction_number'],
        'product_reviews_member_item_transaction_unique'
      )
      table.dropUnique(
        ['member_id', 'item_id', 'transaction_id'],
        'product_reviews_member_item_transaction_id_unique'
      )
      table.dropColumn('transaction_detail_id')
      table.dropColumn('transaction_number')
      table.dropColumn('transaction_id')
    })
  }
}

module.exports = AddTransactionReferenceToProductReviewsSchema
