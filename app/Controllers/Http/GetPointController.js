'use strict'
const GetPoint = use('App/Models/GetPoint')
const Userpartner = use('App/Models/UserPartner')
const Lib = use('App/Lib/LoyaltyLib')
class GetPointController {
    async gets({request, response, auth}) {
        let partner_id = null
        const data = GetPoint.query()
        .filter(request.all().filter)
        .order(request.all().order)
        .with('partner')

        if(auth.user.type !== 'admin') {
            const userPartner = await Userpartner.query().where('user_id',auth.user.user_id).first()
            if(userPartner){
                partner_id = userPartner.partner_id    
            }else{
                partner_id = ''
            }
            data.where('partner_id',partner_id)
        }

        const out = await data.paginate(request.all().page, request.all().rows)
        return response.json({
            status: true,
            data: out
        })
    }

    async create({request, response, auth}) {
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
        
        if(auth.user.type !== 'admin') {
            if(request.all().partner_id !== data.partner_id){
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
