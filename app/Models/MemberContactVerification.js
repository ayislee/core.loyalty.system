'use strict'

const Hash = use('Hash')
const Model = use('Model')

class MemberContactVerification extends Model {
    static get table() {
        return 'member_contact_verifications'
    }

    static get primaryKey() {
        return 'member_contact_verification_id'
    }

    static boot() {
        super.boot()

        this.addTrait('@provider:Lucid/SoftDeletes')

        this.addHook('beforeSave', async (verification) => {
            if (verification.dirty.token) {
                verification.token = await Hash.make(verification.token)
            }
        })
    }

    member() {
        return this.belongsTo('App/Models/Member', 'member_id', 'member_id')
    }
}

module.exports = MemberContactVerification
