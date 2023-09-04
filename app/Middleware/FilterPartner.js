'use strict'


class FilterPartner {
    async handle({ request, auth }, next) {
        // call next to advance the request
        
        await next()
    }
}

module.exports = FilterPartner
