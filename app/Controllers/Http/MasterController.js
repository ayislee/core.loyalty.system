'use strict'
const axios = use('axios')
const Env = use('Env')

class MasterController {
    async province({request, response}){
        try {
            const res = await axios.get(Env.get('MARKETPLACE_CORE')+'transaction/shipping/province')
            // console.log(res.data)
            if(res.data.success){
                return response.json({
                    status: true,   
                    data: res.data.data
                })
            }else{
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }
        } catch (error) {
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async city({request, response}) {

        try {
            const res = await axios.get(Env.get('MARKETPLACE_CORE')+`transaction/shipping/city?province_id=${request.all().province_id}`)
            // console.log(res.data)
            if(res.data.success){
                return response.json({
                    status: true,   
                    data: res.data.data
                })
            }else{
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }
        } catch (error) {
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async payment({response}) {
        try {
            const res = await axios.get(Env.get('MARKETPLACE_CORE')+`list/ms_payment`, {
                params: {
                    ms_payment_identifier: 'MIDTRANS'
                }
            })
            // console.log(res.data)
            if(res.data.success){
                const paymentList = Array.isArray(res.data.data) ? res.data.data : []
                const midtransPayment = paymentList.filter((payment) =>
                    `${payment?.ms_payment_identifier || ''}`.trim().toUpperCase() === 'MIDTRANS'
                )

                return response.json({
                    status: true,   
                    data: midtransPayment
                })
            }else{
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }
        } catch (error) {
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async delivery({request, response}) {
        const req = request.all()
        try {
            const res = await axios.get(Env.get('MARKETPLACE_CORE')+`list/ms_delivery`)
            // console.log(res.data)
            if(res.data.success){
                return response.json({
                    status: true,   
                    data: res.data.data
                })
            }else{
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }
        } catch (error) {
            return response.json({
                status: false,
                message: error.message
            })
        }
    }
}

module.exports = MasterController
