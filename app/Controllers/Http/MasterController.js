'use strict'
const axios = use('axios')
const Env = use('Env')
const CompanyPaymentGatewayService = use('App/Services/CompanyPaymentGatewayService')

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

    async payment({request, response, auth}) {
        try {
            const gateway = await CompanyPaymentGatewayService.resolveForMember({
                member: auth.user,
                partnerId: request.input('partner_id') || null
            })
            return response.json({
                status: true,
                data: [{
                    ms_payment_id: gateway.ms_payment_id,
                    ms_payment_name: gateway.ms_payment_name,
                    ms_payment_identifier: gateway.identifier,
                    configuration_source: gateway.configuration_source,
                    public_configuration: gateway.public_configuration
                }]
            })
        } catch (error) {
            return response.status(error.status || 502).json({
                status: false,
                code: error.code || 'MARKETPLACE_UPSTREAM_ERROR',
                message: error.message || 'Gagal membaca payment gateway.'
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
