'use strict'
const User = use('App/Models/User')
class PartnerOnly {
    async handle({ request, response }, next) {
        // call next to advance the request
        const user = await User.query().where('user_id',request.all().user_id).first()
        if(user.type === 'admin'){
            return response.json({
                status: false,
                message: 'Only user type partner only'
            })
        }

        await next()
    }
}

module.exports = PartnerOnly
