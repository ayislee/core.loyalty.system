'use strict'
const axios = use('axios')
const Env = use('Env')
const Transaction = use('App/Models/Transaction')
const Partner = use('App/Models/Partner')

class TransactionController {
    async list({request, response, auth}){
        const req = request.all()

    }

    async get({request, response, auth}){
        const req = request.all()
        
    }

    async create({request, response, auth}){
        const req = request.all()
        let cashier_id
        const partner = await Partner.query().where('partner_id',auth.user.default_partner_id).first()
        const api = `${Env.get('MARKETPLACE_CORE')}company/slug/${partner.company_slug}/cashier`
        try {
            const cashier = await axios.get(api)
            if(cashier.data.success){
                if(cashier.data.data.length > 0){
                    cashier_id = cashier.data.data[0].cashier_id
                }else{
                    return response.json({
                        status: false,
                        message: 'invalid cashier id'
                    })
                }
            }else{
                return response.json({
                    status: false,
                    message: cashier.data.error
                })
            }
        } catch (error) {
            return response.json({
                status: false,
                message: error.message
            })
        }

        try {
            const params = {
                item: req.item,
                store_id: req.store_id,
                voucher_code: req.voucher_code,
                ms_payment_id: req.ms_payment_id,
                ms_delivery_id: req.ms_delivery_id,
                preview_fee: req.preview_fee,
                customer_name:`${auth.user.firstname?auth.user.firstname:'John'} ${auth.user.lastname?' '+auth.user.lastname:'Doe'}`,
                customer_msisdn: auth.user.phone,
                customer_email: auth.user.email,
                cashier_id: cashier_id,
                shipping_destination: req.shipping_destination,
                shipping_destination_address: req.shipping_destination_address,
                shipping_service: req.shipping_service
            }
            // return response.json(params)
            const res = await axios.post(Env.get('MARKETPLACE_CORE')+'transaction/retail/order',params)
            if(req.preview_fee){
                return response.json(res.data)
            }else{
                if(res.data.success){
                    // catat disini
                    const transaction = new Transaction()
                    transaction.member_id = auth.user.member_id
                    transaction.request = JSON.stringify(params)
                    transaction.response = JSON.stringify(res.data)
                    transaction.url = Env.get('MARKETPLACE_CORE')+'transaction/retail/order'
                    await transaction.save()
                    return response.json({
                        status: true,
                        data: res.data.data,
                        token: res.data.token
                    })
                }else{
    
                    return response.json({
                        status: false,
                        message: res.data.error
                    })
                }

                
            }

            
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

}

module.exports = TransactionController
