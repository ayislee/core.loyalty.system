'use strict'


class ValidatePartner {

    async handle({ request }, next) {
        // call next to advance the request
        
        await next()
    }
}

module.exports = ValidatePartner
