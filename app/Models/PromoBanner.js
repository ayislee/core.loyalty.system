'use strict'
const Model = use('Model')
class PromoBanner extends Model { static get table () { return 'promo_banners' } static get primaryKey () { return 'promo_banner_id' } partner () { return this.belongsTo('App/Models/Partner','partner_id','partner_id') } }
module.exports = PromoBanner
