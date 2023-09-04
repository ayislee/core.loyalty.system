'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class RedeemMerchant extends Model {
    static get table() {
		return "redeem_merchants";
	}

    static get primaryKey(){
		return "redeem_merchant_id"
	}

    static boot () {
        super.boot()
        this.addTrait('@provider:Lucid/SoftDeletes')
        
        
    }

    partner() {
        return this.belongsTo('App/Models/Partner','partner_id','partner_id')
    }

}

module.exports = RedeemMerchant
