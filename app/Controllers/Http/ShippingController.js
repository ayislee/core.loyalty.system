'use strict'
const Address = use('App/Models/Address')
const Env = use('Env')
const axios = use('axios')
const qs = use("qs")

class ShippingController {
    async get({request, response}) {
        const req = request.all()
        try {
            const params = {
                store_id: request.all().store_id,
                destination: request.all().destination,
            }
            // return qs.stringify(params)
            const res = await axios.get(Env.get('MARKETPLACE_CORE')+'transaction/shipping/cost?'+qs.stringify(params))
            // return response.json(res.data) 
            
            if(res.data.success){
                return response.json({
                    status: true,   
                    data: res.data.data
                })
            }else{
                return response.json({
                    status: false,
                    message: res.data.message
                })
            }
        } catch (error) {
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async gosendCost({request, response}) {
        const req = request.all()

        const params = {
            origin: req.origin,
            destination: req.destination,
            paymentType: req.paymentType
        }

        try {
            const res = await axios.get(Env.get('MARKETPLACE_CORE') + 'transaction/shipping/gosend/cost?' + qs.stringify(params))
            return response.json(res.data)
        } catch (error) {
            if (error.response && error.response.data) {
                return response.status(error.response.status || 500).json(error.response.data)
            }

            return response.status(500).json({
                error: error.message
            })
        }
    }
}
module.exports = ShippingController
