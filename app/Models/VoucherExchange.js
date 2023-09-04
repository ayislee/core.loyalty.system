'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class VoucherExchange extends Model {
    static get table() {
		return "voucher_exchanges";
	}

    static get primaryKey(){
		return "voucher_exchange_id"
	}

    static boot () {
        super.boot()
        this.addTrait('@provider:Lucid/SoftDeletes')
        this.addTrait('Filter')
		this.addTrait('OrderBy')
        
        
    }

    member_voucher()  {
        return this.belongsTo('App/Models/MemberVoucher','member_voucher_id','member_voucher_id')
    }

    redeem_merchant() {
        return this.belongsTo('App/Models/RedeemMerchant','redeem_merchant_id','redeem_merchant_id')
    }

}

module.exports = VoucherExchange
