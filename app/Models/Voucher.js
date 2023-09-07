'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class Voucher extends Model {
    static get table() {
		return "vouchers";
	}

    static get primaryKey(){
		return "voucher_id"
	}

    static boot () {
        super.boot()
        this.addTrait('@provider:Lucid/SoftDeletes')
        this.addTrait('Filter')
		this.addTrait('OrderBy')

        this.addGlobalScope((build)=>{
			build.with('partner')
		})
        
    }

    partner()  {
        return this.belongsTo('App/Models/Partner','partner_id','partner_id')
    }

    created() {
        return this.belongsTo('App/Models/User','created_by','user_id')
    }

    updated() {
        return this.belongsTo('App/Models/User','updated_by','user_id')
    }
}

module.exports = Voucher
