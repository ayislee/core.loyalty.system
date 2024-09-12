'use strict'
const MemberPartner = use('App/Models/MemberPartner')
const axios = use('axios')
const Env = use('Env')
class ProductController {
    async store({request,response, auth}) {
        const req = request.all()
        // return response.json(req)
        const memberPartner = await MemberPartner.query()
        .where('member_id',auth.user.member_id)
        .where('partner_id',req.partner_id)
        .with('partner').first()
        const mp = memberPartner.toJSON()
        const company_slug = mp.partner.company_slug

        const api = `${Env.get('MARKETPLACE_CORE')}company/slug/${company_slug}/store`

        try {
            const res = await axios.get(api)
            if(res.data.error){
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }

            return response.json({
                status: true,
                data: res.data.data

            })   
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async list({request, response, auth}) {
        const req = request.all()
        // return response.json(auth.user)
        if(!req.partner_id){
            if(auth.user.default_partner_id !== null){
                req.partner_id = auth.user.default_partner_id !== null
            }else{
                const memberPartner = await MemberPartner.query()
                .where('member_id',auth.user.member_id)
                .fetch()

                if(memberPartner.rows.length > 0){
                    req.partner_id = memberPartner.rows[0].partner_id
                }else{
                    return response.json({
                        status: false,
                        message: "unknow partner"
                    })
                }
            }
        }
        const memberPartner = await MemberPartner.query()
        .where('member_id',auth.user.member_id)
        .where('partner_id',req.partner_id)
        .with('partner').first()

        const mp = memberPartner.toJSON()
        console.log(mp)
        const store_slug = mp.partner.store_slug
        const api = `${Env.get('MARKETPLACE_CORE')}store/slug/${request.all().store_slug}/menu`
        
        try {
            const res = await axios.get(api)
            if(res.data.error){
                console.log(res.data.error)
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }

            
            return response.json({
                
                status: true,
                data: res.data.data

            })   
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }

    }

    async get({request, response, auth}) {
        // {{url_client}}/menu/slug/kaos-musik-community
        try {

            const api = `${Env.get('MARKETPLACE_CORE')}menu/slug/${request.all().slug}`
            const res = await axios.get(api)
            if(res.data.error){
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }

            return response.json({
                status: true,
                data: res.data.data

            })   
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }
    }
}
module.exports = ProductController