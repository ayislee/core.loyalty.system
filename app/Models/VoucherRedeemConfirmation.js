'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const moment = use('moment')

class VoucherRedeemConfirmation extends Model {
    static get table() {
        return 'voucher_redeem_confirmations'
    }

    static get primaryKey() {
        return 'voucher_redeem_confirmation_id'
    }

    static boot() {
        super.boot()
        this.addTrait('@provider:Lucid/SoftDeletes')
    }

    getTokenValidUntil(tokenValidUntil) {
        if (tokenValidUntil) {
            return moment(tokenValidUntil).format('YYYY-MM-DD HH:mm:ss')
        }
        return tokenValidUntil
    }

    member() {
        return this.belongsTo('App/Models/Member', 'member_id', 'member_id')
    }

    voucher() {
        return this.belongsTo('App/Models/Voucher', 'voucher_id', 'voucher_id')
    }

    memberVoucher() {
        return this.belongsTo('App/Models/MemberVoucher', 'member_voucher_id', 'member_voucher_id')
    }
}

module.exports = VoucherRedeemConfirmation
