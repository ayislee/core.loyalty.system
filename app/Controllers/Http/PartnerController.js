'use strict'
const Partner = use('App/Models/Partner')
const Userpartner = use('App/Models/UserPartner')
const Database = use('Database')
const Lib = use('App/Lib/LoyaltyLib')
var randomToken = require('random-token').create('abcdefghijklmnopqrstuvwxzyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');


class PartnerController {
    async gets({request, response, auth}){
        let partner_id = null
        let partner
        if(auth.user.type === 'admin') {
            partner = await Partner.query()
            .filter(request.all().filter)
            .order(request.all().order)
            .paginate(request.all().page, request.all().rows)
            return response.json({
                status: true,
                data: partner
            })
        }else{
            const userPartner = await Userpartner.query().where('user_id',auth.user.user_id).first()
            if(userPartner){
                partner_id = userPartner.partner_id    
            }else{
                partner_id = ''
            }
            
            partner = await Partner.query()
            .filter(request.all().filter)
            .order(request.all().order)
            .where('partner_id',partner_id)
            .paginate(request.all().page, request.all().rows)
            return response.json({
                status: true,
                data: partner
            })
        }
        
    }

    async get({request, response, auth}) {
        let partner_id = null
        let partner
        if(auth.user.type === 'admin'){
            partner = await Partner.query()
            .filter(request.all().filter)
            .order(request.all().order)
            .where('partner_id',request.all().partner_id)
            .first()
            return response.json({
                status: true,
                data: partner
            })
        }else{
            const userPartner = await Userpartner.query().where('user_id',auth.user.user_id).first()
            if(userPartner){
                partner_id = userPartner.partner_id    
            }else{
                partner_id = ''
            }
            
            partner = await Partner.query()
            .filter(request.all().filter)
            .order(request.all().order)
            .where('partner_id',partner_id)
            .first()
            return response.json({
                status: true,
                data: partner
            })
        }
    }

    async create({request, response, auth}) {
        var server_id = randomToken(64);
        var client_id = randomToken(64);
        let partner

        if(auth.user.type === 'admin'){
            try {
                partner = new Partner()
                partner.name = request.all().name
                partner.desc = request.all().desc
                partner.howtogetpoint = request.all().howtogetpoint
                partner.logo = request.all().logo
                partner.server_id = server_id
                partner.client_id = client_id
                await partner.save()
                return response.json({
                    status: true,
                    message: 'success',
                    data: partner
                })
            } catch (error) {
                console.log(error)
                return response.json({
                    status: false,
                    message: 'something error'
                })
            }
        }else{
            if(auth.user.is_owner==='yes'){
                const userPartner = await Userpartner.query().where('user_id',auth.user.user_id).first()
                if(!userPartner){
                    const trx = await Database.beginTransaction()
                    try {
                        
                        partner = new Partner()
                        partner.name = request.all().name
                        partner.desc = request.all().desc
                        partner.howtogetpoint = request.all().howtogetpoint
                        partner.logo = request.all().logo
                        partner.server_id = server_id
                        partner.client_id = client_id    
                        await partner.save(trx)

                        const up = new Userpartner()
                        up.partner_id = partner.partner_id
                        up.user_id = auth.user.user_id
                        await up.save(trx)
                        await trx.commit()

                        return response.json({
                            status: true,
                            message: 'success',
                            data: partner
                        })
                    } catch (error) {
                        await trx.rollback()
                        console.log(error)
                        return response.json({
                            status: false,
                            message: 'something error'
                        })
                    }
                }else{
                    return response.json({
                        status: false,
                        message: 'You cant create more partner'
                    })    
                }
            }else{
                return response.json({
                    status: false,
                    message: 'You not have credential for this action'
                })
            }
        }
    }

    async edit({request, response, auth}) {
        const data = await Partner.query().where('partner_id',request.all().partner_id).first()
        data.name = request.all().name
        data.desc = request.all().desc
        data.howtogetpoint = request.all().howtogetpoint
        data.logo = request.all().logo
        await data.save()
        return response.json({
            status: true,
            message: "success",
            data: data
        })
    }

    async all({request, response}) {
        const data = await Partner.query()
        .select('name','partner_id','logo','desc','howtogetpoint')
        .filter(request.all().filter)
        .order(request.all().order)
        .paginate(request.all().page, request.all().rows)

        return response.json({
            status: true,
            data: data
        })
    }

    async detail({request, response}) {
        const data = await Partner.query()
        .select('name','partner_id','logo','desc','howtogetpoint')
        .where('partner_id', request.all().partner_id)
        .first()

        return response.json({
            status: true,
            data: data
        })
    }
}

module.exports = PartnerController
