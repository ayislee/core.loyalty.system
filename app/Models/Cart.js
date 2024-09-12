'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class Cart extends Model {
    static get table() {
		return "carts";
	}

    static get primaryKey(){
		return "cart_id"
	}

    static boot () {
        super.boot()
        this.addTrait('Filter')
		this.addTrait('OrderBy')
        
        
    }


    partner() {
        return this.belongsTo('App/Models/Partner','partner_id','partner_id')
    }
}

module.exports = Cart
