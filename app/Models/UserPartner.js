'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class UserPartner extends Model {
    static get table() {
		return "user_partners";
	}

    static get primaryKey(){
		return "user_partner_id"
	}

    static boot () {
        super.boot()
        this.addTrait('@provider:Lucid/SoftDeletes')
        
        
    }

    user() {
        return this.belongsTo('App/Models/User','user_id','user_id')
    }

    partner() {
        return this.belongsTo('App/Models/Partner','partner_id','partner_id')
    }
}

module.exports = UserPartner
