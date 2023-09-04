'use strict'
const LoyaltyLib = use('App/Lib/LoyaltyLib')

class HasPartner {
    async handle({ request, response, auth }, next) {
        // call next to advance the request
        if(auth.user.type !== 'admin'){
            const pid = await LoyaltyLib.getPartnerIDFromUser(auth.user.user_id)
            
            if(!pid) {
                return response.json({
                    status: false,
                    message: "You must part of partner"
                })
            }else {
                request.all().partner_id = pid
            }
            
        }
        
        await next()
    }
}

module.exports = HasPartner
