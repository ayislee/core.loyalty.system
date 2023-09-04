'use strict'

class IsAdmin {
    async handle({ request, response, auth }, next) {
        // call next to advance the request
        if(auth.user.type !== 'admin'){
            return response.json({
                status: false,
                message: 'you not have authorize'
            })
        }
        await next()
    }
}

module.exports = IsAdmin
