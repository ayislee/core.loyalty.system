'use strict'
const MemberPartner = use('App/Models/MemberPartner')
const Partner = use('App/Models/Partner')
const ProductReview = use('App/Models/ProductReview')
const ProductReviewEligibility = use('App/Helpers/ProductReviewEligibility')
const Database = use('Database')
const axios = use('axios')
const Env = use('Env')
const CompanyPaymentGatewayService = use('App/Services/CompanyPaymentGatewayService')

const PRODUCT_SEARCH_KEYS = [
    'item_name',
    'item_sku',
    'item_slug',
    'slug',
    'menu_name',
    'menu_sku',
    'menu_slug',
    'category_display_name',
    'category_name',
    'store_name',
    'company_name',
    'item_description',
    'description'
]

class ProductController {
    _aggregateProductAvailability (product) {
        if (!product || typeof product !== 'object' || Array.isArray(product)) return product
        const menus = Array.isArray(product.menu) ? product.menu : []
        if (!menus.length) return product

        const activeMenus = menus.filter((menu) => {
            const status = menu?.store?.store_active_status ?? menu?.store?.store_active_status_name
            return status === undefined || status === null || status === 1 || status === '1' || `${status}`.toLowerCase() === 'active'
        })
        const eligibleMenus = activeMenus.length ? activeMenus : menus
        const aggregateStock = eligibleMenus.reduce(
            (highest, menu) => Math.max(highest, Number(menu?.menu_current_quantity) || 0),
            0
        )
        const representative = eligibleMenus
            .slice()
            .sort((a, b) => (Number(b?.menu_current_quantity) || 0) - (Number(a?.menu_current_quantity) || 0))[0]
        const internalPlatform = (representative?.menu_platform || []).find(
            (platform) => platform?.ms_merchant_payment?.ms_merchant_payment_identifier === 'INTERNAL_MARKETPLACE'
        )
        const currentPrice = Number(internalPlatform?.menu_platform_discount_price) ||
            Number(internalPlatform?.menu_platform_regular_price) ||
            Number(representative?.menu_discount_price) ||
            Number(representative?.menu_regular_price) ||
            Number(product.item_discount_price) || Number(product.item_regular_price) || 0

        return {
            ...product,
            menu_current_quantity: aggregateStock,
            current_price: currentPrice,
            available: aggregateStock > 0,
            stock_status: aggregateStock > 0 ? 'available' : 'unavailable'
        }
    }

    _aggregateProductPayload (payload) {
        if (Array.isArray(payload)) return payload.map((item) => this._aggregateProductAvailability(item))
        if (payload && typeof payload === 'object' && Array.isArray(payload.data)) {
            return { ...payload, data: payload.data.map((item) => this._aggregateProductAvailability(item)) }
        }
        return this._aggregateProductAvailability(payload)
    }

    _sanitizeMarketplaceProduct (value) {
        if (Array.isArray(value)) return value.map((item) => this._sanitizeMarketplaceProduct(item))
        if (!value || typeof value !== 'object') return value
        return Object.entries(value).reduce((result, [key, item]) => {
            // Product endpoints must never turn internal store inventory into
            // customer-visible fulfillment information.
            if (/^(store|stores|store_id|store_slug|store_name|store_address|store_coordinate|menu)$/i.test(key)) return result
            result[key] = this._sanitizeMarketplaceProduct(item)
            return result
        }, {})
    }
    _normalizeKeyword(value) {
        const keyword = `${value || ''}`.trim().toLowerCase()
        return keyword.length > 0 ? keyword : null
    }

    _collectSearchValues(data, values = []) {
        if (!data) return values

        if (Array.isArray(data)) {
            data.forEach((item) => this._collectSearchValues(item, values))
            return values
        }

        if (typeof data !== 'object') return values

        Object.entries(data).forEach(([key, value]) => {
            if (value === null || value === undefined) return

            if (PRODUCT_SEARCH_KEYS.includes(`${key}`) && typeof value !== 'object') {
                values.push(`${value}`)
                return
            }

            if (typeof value === 'object') {
                this._collectSearchValues(value, values)
            }
        })

        return values
    }

    _productMatchesKeyword(item, keyword) {
        if (!keyword) return true
        return this._collectSearchValues(item)
            .join(' ')
            .toLowerCase()
            .includes(keyword)
    }

    _filterProductList(items, keyword) {
        if (!keyword || !Array.isArray(items)) return items
        return items.filter((item) => this._productMatchesKeyword(item, keyword))
    }

    _filterProductPayload(payload, keyword) {
        if (!keyword) return payload
        if (Array.isArray(payload)) return this._filterProductList(payload, keyword)

        if (payload && typeof payload === 'object' && Array.isArray(payload.data)) {
            return {
                ...payload,
                data: this._filterProductList(payload.data, keyword)
            }
        }

        return payload
    }

    async store_get({request, response, auth}) {
        const partner = await Partner.query().where('partner_id',auth.user.default_partner_id).first()
        console.log(partner)
        if (!partner || !partner.company_slug) {
            return response.status(404).json({
                status: false,
                code: 'PARTNER_NOT_FOUND',
                message: 'Partner default member tidak ditemukan.'
            })
        }
        
        const api = `${Env.get('MARKETPLACE_CORE')}store/slug/${partner.store_slug}`
        try {
            const res = await axios.get(api)
            
            if(res.data.error){
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }

            const upstreamData = res.data
            const storeData = upstreamData && upstreamData.data
            const normalizedData = storeData && !Array.isArray(storeData) && storeData.company
                ? { ...upstreamData, data: CompanyPaymentGatewayService.attachToStores([storeData])[0] }
                : upstreamData
            return response.json({
                status: true,
                data: normalizedData

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
        if (!memberPartner) {
            return response.status(404).json({
                status: false,
                code: 'PARTNER_NOT_FOUND',
                message: 'Partner member tidak ditemukan.'
            })
        }
        const mp = memberPartner.toJSON()
        if (!mp.partner || !mp.partner.company_slug) {
            return response.status(422).json({
                status: false,
                code: 'PAYMENT_GATEWAY_UNAVAILABLE',
                message: 'Company partner belum dikonfigurasi.'
            })
        }
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
                data: CompanyPaymentGatewayService.attachToStores(res.data.data)

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
        const { company_slug, store_slug } = request.get()
        const defaultCompanySlug = Env.get('DEFAULT_COMPANY_SLUG')
        const marketplaceCore = Env.get('MARKETPLACE_CORE')
        const nMarketplaceCore = Env.get('NMARKETPLACE') || marketplaceCore

        const activeCompanySlug = company_slug || defaultCompanySlug

        if (!store_slug && !activeCompanySlug) {
            return response.badRequest({
                status: false,
                message: 'store_slug or company_slug is required'
            })
        }

        const api = store_slug
            ? `${nMarketplaceCore}store/slug/${store_slug}`
            : `${marketplaceCore}company/slug/${activeCompanySlug}/store`

        try {
            const res = await axios.get(api)

            if (res?.data?.error) {
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }

            const payload = store_slug
                ? (res?.data?.data || res?.data)
                : res?.data?.data

            return response.json({
                status: true,
                data: payload
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
        const { store_slug, company_slug, item_id, item_slug, category_display_id, category_displat_id, keyword } = request.get()
        const defaultCompanySlug = Env.get('DEFAULT_COMPANY_SLUG')
        let activeStoreSlug = store_slug
        const activeCategoryDisplayId = category_display_id || category_displat_id
        const activeKeyword = this._normalizeKeyword(keyword)
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

        if (activeKeyword) {
            params.keyword = activeKeyword
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

                return response.json(this._sanitizeMarketplaceProduct(this._aggregateProductPayload(
                    this._filterProductPayload(storeRes?.data, activeKeyword)
                )))
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
                data: this._sanitizeMarketplaceProduct(this._aggregateProductPayload(this._filterProductList(res?.data?.data, activeKeyword)))
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
            let productData = res?.data?.data
            if (res?.data?.error || !productData) {
                const companySlug = req.company_slug || Env.get('DEFAULT_COMPANY_SLUG')
                const itemResponse = await axios.get(`${Env.get('MARKETPLACE_CORE')}company/slug/${companySlug}/item`, {
                    params: { item_slug: slug }
                })
                productData = Array.isArray(itemResponse?.data?.data)
                    ? itemResponse.data.data[0]
                    : itemResponse?.data?.data
            }
            if (!productData) {
                return response.status(404).json({ status: false, message: 'Produk tidak ditemukan' })
            }
            productData = this._aggregateProductAvailability(productData)

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
                    ...this._sanitizeMarketplaceProduct(productData),
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

    async createReview({ request, response, auth }) {
        const req = request.all()
        const itemId = Number(req.item_id)
        const rating = Number(req.rating)
        const transactionIdentifier = req.transaction_number || req.transaction_id

        if (!transactionIdentifier) {
            return response.badRequest({
                status: false,
                message: 'transaction_id atau transaction_number wajib diisi'
            })
        }

        if (!Number.isInteger(itemId) || itemId <= 0) {
            return response.badRequest({
                status: false,
                message: 'item_id tidak valid'
            })
        }

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return response.badRequest({
                status: false,
                message: 'Rating wajib diisi dengan nilai 1 sampai 5'
            })
        }

        const toNullableInteger = (value) => {
            const parsed = Number(value)
            return Number.isInteger(parsed) ? parsed : null
        }

        try {
            const transaction = await ProductReviewEligibility.findMemberTransaction({
                email: auth.user.email,
                transactionId: req.transaction_id,
                transactionNumber: req.transaction_number
            })

            if (!transaction) {
                return response.status(404).json({
                    status: false,
                    message: 'Transaksi tidak ditemukan untuk member ini'
                })
            }

            const transactionDetail = ProductReviewEligibility.findTransactionDetailByItemId(transaction, itemId)
            if (!transactionDetail) {
                return response.status(422).json({
                    status: false,
                    message: 'Produk tidak ditemukan pada transaksi ini'
                })
            }

            if (!ProductReviewEligibility.isTransactionReviewable(transaction)) {
                return response.status(422).json({
                    status: false,
                    message: ProductReviewEligibility.getTransactionReviewReason(transaction) || 'Transaksi belum eligible untuk review'
                })
            }

            const transactionReference = ProductReviewEligibility.extractTransactionReference(transaction, req)
            if (!transactionReference.transaction_number && !transactionReference.transaction_id) {
                return response.status(422).json({
                    status: false,
                    message: 'Referensi transaksi tidak tersedia'
                })
            }

            const existingReview = await ProductReviewEligibility.findExistingReview({
                memberId: auth.user.member_id,
                itemId,
                transactionId: transactionReference.transaction_id,
                transactionNumber: transactionReference.transaction_number
            })

            if (existingReview) {
                return response.status(409).json({
                    status: false,
                    message: 'Produk pada transaksi ini sudah direview'
                })
            }

            const comment = req.comment === null || req.comment === undefined
                ? null
                : `${req.comment}`.trim()
            const transactionDetailId = ProductReviewEligibility.extractTransactionDetailId(transactionDetail)

            const review = new ProductReview()
            review.item_id = itemId
            review.member_id = auth.user.member_id
            review.transaction_id = toNullableInteger(transactionReference.transaction_id)
            review.transaction_number = transactionReference.transaction_number || null
            review.transaction_detail_id = toNullableInteger(transactionDetailId)
            review.rating = rating
            review.comment = comment || null

            await review.save()

            return response.json({
                status: true,
                message: 'Review berhasil dikirim',
                data: {
                    review: review.toJSON()
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
