'use strict'
const MemberPartner = use('App/Models/MemberPartner')
const Partner = use('App/Models/Partner')
const ProductReview = use('App/Models/ProductReview')
const Database = use('Database')
const axios = use('axios')
const Env = use('Env')
class ProductController {
    async store_get({request, response, auth}) {
        const partner = await Partner.query().where('partner_id',auth.user.default_partner_id).first()
        console.log(partner)
        
        const api = `${Env.get('MARKETPLACE_CORE')}store/slug/${partner.store_slug}`
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
                data: res.data

            })   
        } catch (error) {
            return response.json({
                status: false,
                data: error.message

            })   
        }
    }

    async store({request,response, auth}) {
        const req = request.all()
        // return response.json(req)
        const memberPartner = await MemberPartner.query()
        .where('member_id',auth.user.member_id)
        .where('partner_id',req.partner_id)
        .with('partner').first()
        const mp = memberPartner.toJSON()
        const company_slug = mp.partner.company_slug
        console.log(company_slug)
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

        const partner = await Partner.query().where("partner_id", auth.user.default_partner_id).first()
        const api = `${Env.get('MARKETPLACE_CORE')}store/slug/${partner.store_slug}/menu`
        
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

    async cashier({request, response, auth}) {
        const req = request.all()

        const partner = await Partner.query().where('partner_id',auth.user.default_partner_id).first()
        console.log(partner)
        
        if(!partner) {
            return response.json({
                status: false,
                message: 'invalid partner_id'
            })
        }
        const api = `${Env.get('MARKETPLACE_CORE')}company/slug/${partner.company_slug}/cashier`
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
                data: res.data.data[0]?res.data.data[0]:null
            })   
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }

    }

    async publicStore({ request, response }) {
        const { company_slug } = request.get()
        const defaultCompanySlug = Env.get('DEFAULT_COMPANY_SLUG')

        const activeCompanySlug = company_slug || defaultCompanySlug

        if (!activeCompanySlug) {
            return response.badRequest({
                status: false,
                message: 'company_slug is required'
            })
        }

        const api = `${Env.get('MARKETPLACE_CORE')}company/slug/${activeCompanySlug}/store`

        try {
            const res = await axios.get(api)

            if (res.data.error) {
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

    async publicCategory({ request, response }) {
        const { company_slug } = request.get()
        const defaultCompanySlug = Env.get('DEFAULT_COMPANY_SLUG')

        const activeCompanySlug = company_slug || defaultCompanySlug

        if (!activeCompanySlug) {
            return response.badRequest({
                status: false,
                message: 'company_slug is required'
            })
        }

        const api = `${Env.get('MARKETPLACE_CORE')}company/slug/${activeCompanySlug}/category`

        try {
            const res = await axios.get(api)

            if (res?.data?.error) {
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }

            return response.json(res.data)
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async publicProduct({ request, response }) {
        const { store_slug, company_slug, item_id, item_slug, category_display_id, category_displat_id } = request.get()
        const defaultCompanySlug = Env.get('DEFAULT_COMPANY_SLUG')
        let activeStoreSlug = store_slug
        const activeCategoryDisplayId = category_display_id || category_displat_id
        const params = {}

        if (item_id) {
            params.item_id = item_id
        }

        if (item_slug) {
            params.item_slug = item_slug
        }

        if (activeCategoryDisplayId) {
            params.category_display_id = activeCategoryDisplayId
        }

        try {
            if (!activeStoreSlug) {
                const activeCompanySlug = company_slug || defaultCompanySlug
                if (!activeCompanySlug) {
                    return response.badRequest({
                        status: false,
                        message: 'store_slug or company_slug is required'
                    })
                }

                const storeApi = `${Env.get('MARKETPLACE_CORE')}company/slug/${activeCompanySlug}/item`
                const storeRes = await axios.get(storeApi, { params })

                if (storeRes?.data?.error) {
                    return response.json({
                        status: false,
                        message: storeRes.data.error
                    })
                }

                return response.json(
                    storeRes?.data
                )
                // const firstStore = storeRes?.data?.data?.[0]
                // if (!firstStore?.store_slug) {
                //     return response.json({
                //         status: false,
                //         message: 'Store tidak ditemukan'
                //     })
                // }
                // activeStoreSlug = firstStore.store_slug

            }

            const api = `${Env.get('MARKETPLACE_CORE')}store/slug/${activeStoreSlug}/menu`
            const res = await axios.get(api, { params })

            if (res?.data?.error) {
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }

            return response.json({
                status: true,
                data: res?.data?.data
            })
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async publicProductDetail({ request, response, params }) {
        const req = request.all()
        const slug = req.slug || req.item_slug || req.menu_slug || params.slug

        if (!slug) {
            return response.badRequest({
                status: false,
                message: 'slug is required'
            })
        }

        try {
            const api = `${Env.get('MARKETPLACE_CORE')}menu/slug/${slug}`
            const res = await axios.get(api)
            if (res?.data?.error) {
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }

            const productData = res?.data?.data

            // Tambahkan agregasi review
            const agg = await Database
                .from('product_reviews')
                .where('item_id', productData?.item_id)
                .avg('rating as avg_rating')
                .count('* as total')
                .first()

            return response.json({
                status: true,
                data: {
                    ...productData,
                    review_summary: {
                        average: agg && agg.avg_rating ? Number(agg.avg_rating) : 0,
                        total: agg && agg.total ? Number(agg.total) : 0
                    }
                }
            })
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async publicProductReview({ request, response }) {
        const { item_id } = request.get()

        if (!item_id) {
            return response.badRequest({
                status: false,
                message: 'item_id is required'
            })
        }

        try {
            const reviews = await ProductReview.query()
                .where('item_id', item_id)
                .orderBy('created_at', 'desc')
                .fetch()

            const agg = await Database
                .from('product_reviews')
                .where('item_id', item_id)
                .avg('rating as avg_rating')
                .count('* as total')
                .first()

            return response.json({
                status: true,
                data: {
                    reviews: reviews.toJSON(),
                    average: agg && agg.avg_rating ? Number(agg.avg_rating) : 0,
                    total: agg && agg.total ? Number(agg.total) : 0
                }
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
