'use strict'

const Model = use('Model')

class ProductReview extends Model {
  static get table () {
    return 'product_reviews'
  }

  static get primaryKey () {
    return 'review_id'
  }
}

module.exports = ProductReview
