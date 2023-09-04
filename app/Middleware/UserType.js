'use strict'
const UserPartner = use('App/Models/UserPartner')
class UserType {
    /**
     * @param {object} ctx
     * @param {Request} ctx.request
     * @param {Function} next
     */
    async handle({ request, response, auth }, next) {
        // call next to advance the request
        if(auth.user.type==='partner'){
            const userPartner = await UserPartner.query().where('user_id', auth.user.user_id).with('partner').first()
            if(userPartner){
                
            }
        }else{
            // admin
        }
        await next()
    }
}

module.exports = UserType
