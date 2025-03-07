'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class Address extends Model {
    static get table() {
		return "addresses";
	}

    static get primaryKey(){
		return "address_id"
	}

    static boot () {
        super.boot()
        this.addTrait('Filter')
		this.addTrait('OrderBy')
        
        
    }

}

module.exports = Address
