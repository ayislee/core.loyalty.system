'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class Transaction extends Model {
    static get table() {
		return "transactions";
	}

    static get primaryKey(){
		return "transaction_id"
	}

    static boot () {
        super.boot()
        this.addTrait('Filter')
		this.addTrait('OrderBy')
        
        
    }

}

module.exports = Transaction