'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class Partner extends Model {
    static get table() {
		return "partners";
	}

    static get primaryKey(){
		return "partner_id"
	}

    static boot () {
        super.boot()

        /**
        * A hook to hash the user password before saving
        * it to the database.
        */

        this.addTrait('@provider:Lucid/SoftDeletes')
        this.addTrait('Filter')
		this.addTrait('OrderBy')
    }
}

module.exports = Partner
