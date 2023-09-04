'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class GetPoint extends Model {
    static get table() {
		return "get_points";
	}

    static get primaryKey(){
		return "get_point_id"
	}

    static boot () {
        super.boot()
        this.addTrait('@provider:Lucid/SoftDeletes')
        this.addTrait('Filter')
		this.addTrait('OrderBy')
        
        
    }


    partner() {
        return this.belongsTo('App/Models/Partner','partner_id','partner_id')
    }
}

module.exports = GetPoint
