'use strict'
class ConvertPhone {
    async handle ({ request,response,auth }, next) {
        // call next to advance the request

        await next()
    }
}

module.exports = ConvertPhone