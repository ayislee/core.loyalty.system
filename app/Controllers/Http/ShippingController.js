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
        const query = request.get()
        const normalizeCoordinate = (value) => {
            if (!value && value !== 0) {
                return ''
            }

            if (Array.isArray(value)) {
                return value.join(',').replace(/\s+/g, '')
            }

            return String(value).replace(/\s+/g, '')
        }

        const isLatLong = (value) => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(value)

        const params = {
            origin: normalizeCoordinate(query.origin),
            destination: normalizeCoordinate(query.destination),
            paymentType: query.paymentType
        }

        if (!isLatLong(params.origin)) {
            return response.status(400).json({
                error: 'origin is required and must be in lat,long format'
            })
        }

        if (!isLatLong(params.destination)) {
            return response.status(400).json({
                error: 'destination is required and must be in lat,long format'
            })
        }

        try {
            const res = await axios.get(Env.get('MARKETPLACE_CORE') + 'transaction/shipping/gosend/cost', { params })
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
