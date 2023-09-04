'use strict'
const User = use('App/Models/User')

class IsEmailUsed {

    async handle({ request, response }, next) {
        // call next to advance the request
        // check email
        const usrEdit = await User.query()
        .where('email',request.all().email)
        .whereNot('user_id',request.all().user_id)
        .first()

        if(usrEdit){
            return response.json({
                status: false,
                message: 'email already used',
            })
        }

        await next()
    }
}

module.exports = IsEmailUsed
