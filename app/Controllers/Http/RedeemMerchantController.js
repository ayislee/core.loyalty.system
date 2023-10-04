'use strict'
const RedeemMerchant = use('App/Models/RedeemMerchant')
const Lib = use('App/Lib/LoyaltyLib')
class RedeemMerchantController {
    async gets({request, response, auth}) {
        const data = RedeemMerchant.query()
        .with('partner')
        if(auth.user.type !== 'admin'){
            const pid = await Lib.getPartnerIDFromUser(auth.user.user_id)
            if(pid){
                data.where('partner_id',pid)
            }else{
                data.where('partner_id',null)
            }
        }

        const out = await data.paginate(request.all().page, request.all().rows)
        return response.json({
            status: true,
            data: out
        })
    }

    async get({request, response, auth}) {
        const data = RedeemMerchant.query()
        .with('partner')
        if(auth.user.type !== 'admin'){
            const pid = await Lib.getPartnerIDFromUser(auth.user.user_id)
            if(pid){
                data.where('partner_id',pid)
            }else{
                data.where('partner_id',null)
            }
        }

        const out = await data.where('redeem_merchant_id', request.all().redeem_merchant_id).first()
        return response.json({
            status: true,
            data: out
        })
    }

    async create({request, response, auth}) {
        
        const data = new RedeemMerchant()
        data.name =  request.all().name
        data.address = request.all().address
        data.lat = request.all().lat
        data.long = request.all().long
        data.phone = request.all().phone
        data.partner_id = request.all().partner_id
        data.store_id = request.all().store_id

        await data.save()

        return response.json({
            status: true,
            message: 'success', 
            data : data
        })
    }

    async edit({request, response, auth}) {
        const data = await RedeemMerchant.find(request.all().redeem_merchant_id)
        data.name = request.all().name ? request.all().name : data.redeem_merchant_id
        data.address = request.all().address ? request.all().address : data.address
        data.phone = request.all().phone ? request.all().phone : data.phone
        data.lat = request.all().lat ? request.all().lat : data.lat
        data.long = request.all().long ? request.all().long : data.long
        data.store_id = request.all().store_id ? request.all().store_id : data.store_id
        await data.save()
        return response.json({
            status: true,
            message: 'success',
            data: data
        })

    }
}

module.exports = RedeemMerchantController
