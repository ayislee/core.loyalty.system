'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const moment = use('moment')
class MemberVoucher extends Model {
    static get table() {
		return "member_vouchers";
	}

    static get primaryKey(){
		return "member_voucher_id"
	}

    static boot () {
        super.boot()
        this.addTrait('@provider:Lucid/SoftDeletes')
        
        
    }

    getExpireDate(expire_date) {
        if(expire_date){
            return moment(expire_date).format("YYYY-MM-DD HH:mm:ss")
        }else{
            return expire_date
        }
    }

    member()  {
        return this.belongsTo('App/Models/Member','member_id','member_id')
    }

    voucher() {
        return this.belongsTo('App/Models/Voucher','voucher_id','voucher_id')
    }
}

module.exports = MemberVoucher
