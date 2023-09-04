'use strict'
const Voucher = use('App/Models/Voucher')
const UserPartner = use('App/Models/UserPartner')
const ThisLib = use('App/Lib/LoyaltyLib')
class VoucherController {
    async gets({request, response, auth}){
        
        let pid
        const data = Voucher.query()
        .with('partner')
        .with('created')
        .with('updated')
        .filter(request.all().filter)
        .order(request.all().order)
        if(auth.user.type === 'partner'){
            // partner's voucher
            pid = await ThisLib.getPartnerIDFromUser(auth.user.user_id)
            if(pid){
                data.where('partner_id', pid)
            }else{
                return response.json({
                    status: true,
                    data: {
                        total: 0,
                        perPage: request.all().rows,
                        page: 1,
                        lastPage: 0,
                    }
                })
            }
            
            
        }

        const out = await data.paginate(request.all().page, request.all().rows)
        return response.json({
            status: true,
            data: out
        })
        
    }

    async create({request, response, auth}) {
        let pid
        const voucher = new Voucher()
        voucher.name = request.all().name
        voucher.sku = request.all().sku
        voucher.status = request.all().status
        voucher.description = request.all().description
        voucher.duration = request.all().duration
        voucher.product_image = request.all().product_image
        voucher.number_point = request.all().number_point
        voucher.created_by = auth.user.user_id
        voucher.updated_by = auth.user.user_id

        if(auth.user.type === 'admin'){
            voucher.partner_id = request.all().partner_id
            
        }else{
            pid = await ThisLib.getPartnerIDFromUser(auth.user.user)
            if(pid){
                voucher.partner_id = pid
            }else{
                return response.json({
                    status: false,
                    message: 'You cant create Voucher'
                })
            }
        }

        await voucher.save()
        return response.json({
            status: true,
            message: 'success', 
            data: voucher
        })
    }
    async edit({request, response, auth}) {
        const data = await Voucher.find(request.all().voucher_id)
        data.name = request.all().name ? request.all().name : data.name
        data.sku = request.all().sku ? request.all().sku : data.sku
        data.product_image = request.all().product_image ? request.all().product_image : data.product_image
        data.number_point = request.all().number_point ? request.all().number_point : data.number_point
        data.status = request.all().status ? request.all().status : data.status
        data.description = request.all().description ? request.all().description : data.description
        data.duration = request.all().duration ? request.all().duration : data.duration
        await data.save()

        return response.json({
            status: true,
            message: 'success',
            data: data
        })
        
        
        
        

        return response.json(request.all())
    }
}

module.exports = VoucherController
