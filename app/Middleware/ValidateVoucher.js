'use strict'
const Lib = use('App/Lib/LoyaltyLib')

class ValidateVoucher {
    async handle({ request, response, auth }, next) {
        // call next to advance the request
        await next()
    }
}

module.exports = ValidateVoucher
