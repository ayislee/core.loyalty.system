'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const Hash = use('Hash')
const Env = use('Env')
const moment = use('moment')

class Member extends Model {

    static get table() {
		return "members";
	}

    static get primaryKey(){
		return "member_id"
	}

    static get hidden() {
        return ['password']
    }

    getTokenValidUntil(token_valid_until){
        console.log('t',token_valid_until)
        if(token_valid_until){
            return moment(token_valid_until).format("YYYY-MM-DD HH:mm:ss")
        }else{
            return token_valid_until
        }

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
        
        this.addHook('beforeSave', async (userInstance) => {
            if (userInstance.dirty.password) {
                userInstance.password = await Hash.make(userInstance.password)
            }

            if (userInstance.dirty.token) {
                userInstance.token = await Hash.make(userInstance.token)
                // const next = moment().add(Env.get('TOKEN_VALIDITY_PERIODE'), 'minutes')
                userInstance.token_valid_until = moment().add(Env.get('TOKEN_VALIDITY_PERIODE'), 'minutes').format("YYYY-MM-DD HH:mm:ss")
            }

        })

        
    }

    point() {
        return this.hasOne('App/Models/Point','member_id','member_id')
    }

    member_voucher() {
        return this.hasMany('App/Models/MemberVoucher','member_id','member_id')
    }
}

module.exports = Member
