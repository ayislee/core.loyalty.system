'use strict'


class Admin {
    async handle ({ request,response,auth }, next) {
        // call next to advance the request

        
        if(!auth.user){
     
            return response.json({
                status: false,
                message: 'you are not allowed'
            })
        }
        await next()
    }
}

module.exports = Admin
