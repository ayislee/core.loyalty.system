'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class MemberPartner extends Model {
    static get table() {
		return "member_partners";
	}

    static get primaryKey(){
		return "member_partner_id"
	}

    static boot () {
        super.boot()
        this.addTrait('@provider:Lucid/SoftDeletes')
        
        
    }

    member() {
        return this.belongsTo('App/Models/Member','member_id','member_id')
    }

    partner() {
        return this.belongsTo('App/Models/Partner','partner_id','partner_id')
    }
}

module.exports = MemberPartner
