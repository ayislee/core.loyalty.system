'use strict'
const GetPoint = use('App/Models/GetPoint')
const Userpartner = use('App/Models/UserPartner')
const Lib = use('App/Lib/LoyaltyLib')
const scopedPartnerId = async (user) => {
    const partnerId = await Lib.getPartnerIDFromUser(user.user_id)
    return user.type === 'partner' ? (partnerId || '') : (partnerId || null)
}
class GetPointController {
    async gets({request, response, auth}) {
        const partner_id = await scopedPartnerId(auth.user)
        const data = GetPoint.query()
        .filter(request.all().filter)
        .order(request.all().order)
        .with('partner')

        if(partner_id !== null) {
            data.where('partner_id',partner_id)
        }

        const out = await data.paginate(request.all().page, request.all().rows)
        return response.json({
            status: true,
            data: out
        })
    }

    async get({request, response, auth}) {
        const partner_id = await scopedPartnerId(auth.user)
        const data = GetPoint.query()
        .filter(request.all().filter)
        .order(request.all().order)
        .with('partner')

        if(partner_id !== null) {
            data.where('partner_id',partner_id)
        }

        const out = await data.where('get_point_id',request.all().get_point_id).first()
        return response.json({
            status: true,
            data: out
        })
    }


    async create({request, response, auth}) {
        const partner_id = await scopedPartnerId(auth.user)
        if (partner_id !== null) request.all().partner_id = partner_id
        // validate code
        const validate = await GetPoint.query()
        .where('partner_id',request.all().partner_id)
        .where('code',request.all().code)
        .first()
        if(validate){
            return response.json({
                status: false,
                message: `code ${request.all().code} already defined`
            })
        }

        const data = new GetPoint()
        data.name = request.all().name
        data.partner_id = request.all().partner_id
        data.code = request.all().code
        data.point_receive = request.all().point_receive
        data.desc = request.all().desc
        await data.save()
        return response.json({
            status: true,
            message: 'success'
        })
    }

    async edit({request, response, auth}) {
        // return response.json(request.all())
        const data = await GetPoint.query().where('get_point_id', request.all().get_point_id).first()
        
        const partner_id = await scopedPartnerId(auth.user)
        if(partner_id !== null) {
            if(partner_id !== data.partner_id){
                return response.json({
                    status: false,
                    message: 'invalid command'
                })
            }    
            
        }

        try {
            data.name = request.all().name
            data.code = request.all().code
            data.point_receive = request.all().point_receive
            data.desc = request.all().desc
            await data.save()
            return response.json({
                status: true,
                message: 'success',
                data: data
            })
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: 'something wrong',
            })
        }
    }
}

module.exports = GetPointController
