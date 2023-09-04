'use strict'
const Partner = use('App/Models/Partner')

class AuthMerchant {

    async handle({ request, response }, next) {
        // call next to advance the request
        if(!request.all().sid){
            return response.json({
                status: false,
                message: 'sid is required'
            })
        }

        if(!request.all().cid){
            return response.json({
                status: false,
                message: 'cid is required'
            })
        }

        const partner = await Partner.query().where('server_id', request.all().sid).where('client_id',request.all().cid).first()
        if(!partner) {
            return response.json({
                status: false,
                message: 'invalid partner'
            })
        }

        request.all().partner_id = partner.partner_id


        await next()
    }
}

module.exports = AuthMerchant
