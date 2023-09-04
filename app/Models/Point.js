'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class Point extends Model {
    static get table() {
		return "points";
	}

    static get primaryKey(){
		return "point_id"
	}

    static boot () {
        super.boot()
        this.addTrait('@provider:Lucid/SoftDeletes')
        
        
    }

    member() {
        return this.belongsTo('App/Models/Member','member_id','member_id')
    }

}

module.exports = Point
