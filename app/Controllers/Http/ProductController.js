'use strict'
const MemberPartner = use('App/Models/MemberPartner')
const Partner = use('App/Models/Partner')
const ProductReview = use('App/Models/ProductReview')
const ProductReviewEligibility = use('App/Helpers/ProductReviewEligibility')
const Database = use('Database')
const axios = use('axios')
const Env = use('Env')
const CompanyPaymentGatewayService = use('App/Services/CompanyPaymentGatewayService')
const MemberStoreService = use('App/Services/MemberStoreService')

const BEST_SELLER_CACHE_TTL_MS = 5 * 60 * 1000
const bestSellerCache = new Map()

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
    _normalizeStoreList (payload) {
        const data = payload?.data ?? payload
        if (Array.isArray(data)) return data
        if (Array.isArray(data?.data)) return data.data
        return []
    }

    _extractMenuItems (payload) {
        const data = payload?.data ?? payload
        if (Array.isArray(data)) return data
        if (Array.isArray(data?.menu)) return data.menu
        if (data?.menu && typeof data.menu === 'object') {
            return Object.values(data.menu).reduce((items, group) => (
                items.concat(Array.isArray(group) ? group : [])
            ), [])
        }
        if (Array.isArray(data?.data)) return data.data
        return []
    }

    _collectCategoryDisplayIds (value, categoryIds = new Set()) {
        if (Array.isArray(value)) {
            value.forEach((item) => this._collectCategoryDisplayIds(item, categoryIds))
            return categoryIds
        }

        if (!value || typeof value !== 'object') return categoryIds

        const categoryId = value.category_display_id
        if (categoryId !== undefined && categoryId !== null && `${categoryId}`.trim() !== '') {
            categoryIds.add(`${categoryId}`)
        }

        Object.values(value).forEach((item) => this._collectCategoryDisplayIds(item, categoryIds))
        return categoryIds
    }

    _collectCategoryDisplayNames (payload) {
        const data = payload?.data ?? payload
        const menuGroups = data?.menu
        if (!menuGroups || typeof menuGroups !== 'object' || Array.isArray(menuGroups)) return new Set()

        return new Set(Object.keys(menuGroups).map((name) => `${name}`.trim()).filter(Boolean))
    }

    async _appendReviewSummaries (products) {
        const itemIds = [...new Set((Array.isArray(products) ? products : [])
            .map((product) => product?.item_id)
            .filter((itemId) => itemId !== undefined && itemId !== null))]

        if (!itemIds.length) return products

        const summaries = await Database
            .from('product_reviews')
            .whereIn('item_id', itemIds)
            .select('item_id')
            .avg('rating as avg_rating')
            .count('* as total')
            .groupBy('item_id')

        const summaryByItemId = new Map(summaries.map((summary) => [
            `${summary.item_id}`,
            {
                average: summary.avg_rating ? Number(summary.avg_rating) : 0,
                total: summary.total ? Number(summary.total) : 0
            }
        ]))

        return products.map((product) => ({
            ...product,
            review_summary: summaryByItemId.get(`${product?.item_id}`) || { average: 0, total: 0 }
        }))
    }

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
        const regularPrice = Number(representative?.menu_regular_price ?? product.menu_regular_price) || 0
        const configuredDiscount = representative?.menu_discount_marketplace_price ?? product.menu_discount_marketplace_price
        const marketplaceDiscountPrice = configuredDiscount === null || configuredDiscount === undefined ? null : Number(configuredDiscount)
        const hasMarketplaceDiscount = Number.isFinite(marketplaceDiscountPrice) && marketplaceDiscountPrice > 0 && marketplaceDiscountPrice < regularPrice
        const currentPrice = hasMarketplaceDiscount ? marketplaceDiscountPrice : regularPrice

        return {
            ...product,
            // A catalogue entry represents one menu at the active store. Keep
            // that identity after the nested menu payload is sanitized.
            menu_id: representative?.menu_id ?? product.menu_id,
            menu_slug: representative?.menu_slug ?? product.menu_slug,
			menu_regular_price: regularPrice,
			menu_discount_marketplace_price: hasMarketplaceDiscount ? marketplaceDiscountPrice : null,
			has_marketplace_discount: hasMarketplaceDiscount,
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
    _paginateProductList (items, pageValue, rowsValue) {
        const page = Math.max(1, Number.parseInt(pageValue, 10) || 1)
        const rows = Math.min(100, Math.max(1, Number.parseInt(rowsValue, 10) || 15))
        const data = Array.isArray(items) ? items : []
        const total = data.length
        const lastPage = Math.max(1, Math.ceil(total / rows))
        const currentPage = Math.min(page, lastPage)
        const offset = (currentPage - 1) * rows

        return {
            data: data.slice(offset, offset + rows),
            page: currentPage,
            last_page: lastPage,
            total
        }
    }
    _resolveProductPagination (items, source, pageValue, rowsValue) {
        const remoteLastPage = Number(source?.last_page || source?.lastPage || source?.meta?.last_page)

        if (Number.isFinite(remoteLastPage) && remoteLastPage > 0) {
            return {
                data: Array.isArray(items) ? items : [],
                page: Math.max(1, Number(source?.page || source?.current_page || source?.meta?.current_page) || 1),
                last_page: Math.max(1, remoteLastPage),
                total: Number(source?.total || source?.meta?.total) || 0
            }
        }

        return this._paginateProductList(items, pageValue, rowsValue)
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

    _filterProductsByCategoryName (items, categoryName) {
        const normalizedCategoryName = `${categoryName || ''}`.trim().toLowerCase()
        if (!normalizedCategoryName || !Array.isArray(items)) return items

        return items.filter((item) => (
            `${item?.category_display_name || item?.category_name || ''}`.trim().toLowerCase() === normalizedCategoryName
        ))
    }

    _filterProductIdentifiers(items, menuId, itemId, itemSlug) {
        if (!Array.isArray(items) || (!menuId && !itemId && !itemSlug)) return items
        return items.filter((item) => {
            if (menuId && (
                `${item?.menu_id}` === `${menuId}` ||
                (Array.isArray(item?.menu) && item.menu.some((menu) => `${menu?.menu_id}` === `${menuId}`))
            )) return true
            if (itemId && `${item?.item_id}` === `${itemId}`) return true
            if (itemSlug && [item?.item_slug, item?.slug, item?.menu_slug].some((value) => `${value || ''}` === `${itemSlug}`)) return true
            return false
        })
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
        try {
            const resolved = await MemberStoreService.resolve(auth.user.default_store_slug)
            // Repair a removed/invalid saved preference while serving the safe default.
            if (auth.user.default_store_slug !== resolved.storeSlug) {
                auth.user.default_store_slug = resolved.storeSlug
                await auth.user.save()
            }
            const res = await axios.get(`${Env.get('MARKETPLACE_CORE')}store/slug/${resolved.storeSlug}/menu`, { params: request.all() })
            if(res.data.error){
                console.log(res.data.error)
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }

            
            return response.json({
                
                status: true,
                data: res.data.data,
                store_slug: resolved.storeSlug,
                store_name: resolved.store.store_name || resolved.store.name || resolved.storeSlug

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

            const stores = this._normalizeStoreList(payload)
            const defaultStore = await MemberStoreService.findBySlug(Env.get('DEFAULT_STORE_SLUG'), activeCompanySlug)
            if (defaultStore && !stores.some((store) => `${store?.store_slug || store?.slug || ''}` === `${Env.get('DEFAULT_STORE_SLUG')}`)) {
                stores.unshift(defaultStore)
            }
            return response.json({
                status: true,
                data: payload,
                default_store_slug: Env.get('DEFAULT_STORE_SLUG'),
                stores
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
        const { company_slug, store_slug } = request.get()
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
            const categoryRequest = axios.get(api)

            if (store_slug) {
                const [res, resolved] = await Promise.all([
                    categoryRequest,
                    MemberStoreService.resolve(store_slug, activeCompanySlug)
                ])

                if (res?.data?.error) {
                    return response.json({
                        status: false,
                        message: res.data.error
                    })
                }

                if (!resolved.isValid) {
                    return response.badRequest({ status: false, message: 'Toko tidak ditemukan' })
                }

                const categories = Array.isArray(res?.data?.data) ? res.data.data : []
                const menuApi = `${Env.get('MARKETPLACE_CORE')}store/slug/${resolved.storeSlug}/menu`
                const menuResponse = await axios.get(menuApi)
                const categoryIds = this._collectCategoryDisplayIds(this._extractMenuItems(menuResponse?.data))
                const categoryNames = this._collectCategoryDisplayNames(menuResponse?.data)
                const filteredCategories = categories.filter((category) => (
                    categoryIds.has(`${category?.category_display_id}`) ||
                    categoryNames.has(`${category?.category_display_name || ''}`.trim())
                ))

                return response.json({
                    ...res.data,
                    data: filteredCategories
                })
            }

            const res = await categoryRequest

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
        const { store_slug, company_slug, menu_id, item_id, item_slug, category_display_id, category_displat_id, category_display_name, keyword, page, rows } = request.get()
        const defaultCompanySlug = Env.get('DEFAULT_COMPANY_SLUG')
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

        if (page) params.page = page
        if (rows) params.rows = rows

        try {
            const resolved = await MemberStoreService.resolve(store_slug, company_slug || defaultCompanySlug)
            if (store_slug && !resolved.isValid) {
                return response.badRequest({ status: false, message: 'Toko tidak ditemukan' })
            }
            const api = `${Env.get('MARKETPLACE_CORE')}store/slug/${resolved.storeSlug}/menu`
            const res = await axios.get(api, { params })

            if (res?.data?.error) {
                return response.json({
                    status: false,
                    message: res.data.error
                })
            }

            const matchedItems = this._filterProductIdentifiers(this._extractMenuItems(res?.data), menu_id, item_id, item_slug)
            const categoryItems = this._filterProductsByCategoryName(matchedItems, category_display_name)
            const productItems = this._sanitizeMarketplaceProduct(this._aggregateProductPayload(
                this._filterProductList(categoryItems, activeKeyword)
            ))
            const pagination = this._paginateProductList(productItems, page, rows)
            pagination.data = await this._appendReviewSummaries(pagination.data)

            return response.json({
                status: true,
                store_slug: resolved.storeSlug,
                store_name: resolved.store.store_name || resolved.store.name || resolved.storeSlug,
                ...pagination
            })
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async publicBestSellers ({ request, response }) {
        const companySlug = Env.get('DEFAULT_COMPANY_SLUG')
        const requestedStoreSlug = request.input('store_slug')

        if (!companySlug) {
            return response.badRequest({ status: false, message: 'DEFAULT_COMPANY_SLUG belum dikonfigurasi' })
        }

        try {
            const resolved = await MemberStoreService.resolve(requestedStoreSlug, companySlug)
            if (requestedStoreSlug && !resolved.isValid) {
                return response.badRequest({ status: false, message: 'Toko tidak ditemukan' })
            }

            const cacheKey = `${companySlug}:${resolved.storeSlug}`
            const cached = bestSellerCache.get(cacheKey)
            let upstreamRequest

            if (cached && cached.expiresAt > Date.now()) {
                upstreamRequest = cached.value
            } else {
                upstreamRequest = axios.get(
                    `${Env.get('MARKETPLACE_CORE')}company/slug/${encodeURIComponent(companySlug)}/product/best-sellers`,
                    {
                        params: { store_slug: resolved.storeSlug, limit: 8 },
                        timeout: 8000
                    }
                ).then((upstreamResponse) => {
                    if (upstreamResponse?.data?.error) throw new Error(upstreamResponse.data.error)
                    return upstreamResponse?.data?.data || null
                })

                const entry = {
                    expiresAt: Date.now() + BEST_SELLER_CACHE_TTL_MS,
                    value: upstreamRequest
                }
                bestSellerCache.set(cacheKey, entry)
                upstreamRequest.catch(() => {
                    if (bestSellerCache.get(cacheKey) === entry) bestSellerCache.delete(cacheKey)
                })
            }

            const upstreamData = await upstreamRequest
            const products = Array.isArray(upstreamData?.products) ? upstreamData.products : []

            return response.json({
                status: true,
                data: {
                    period_start: upstreamData?.period_start || null,
                    period_end: upstreamData?.period_end || null,
                    products: products.map((product) => ({
                        rank: Number(product?.rank) || 0,
                        menu_id: product?.menu_id,
                        item_id: product?.item_id,
                        item_name: product?.item_name || 'Produk tanpa nama',
                        item_slug: product?.item_slug || product?.menu_slug || '',
                        menu_slug: product?.menu_slug || '',
                        image_url: Array.isArray(product?.item_image) ? product.item_image[0] : product?.item_image,
						menu_regular_price: Number(product?.menu_regular_price) || 0,
						menu_discount_marketplace_price: product?.menu_discount_marketplace_price ?? null,
						has_marketplace_discount: Boolean(product?.has_marketplace_discount),
                        current_price: Number(product?.current_price) || 0,
                        stock: Number(product?.menu_current_quantity) || 0,
                        sold_quantity: Number(product?.sold_quantity) || 0
                    })).filter((product) => product.menu_id && product.item_slug)
                }
            })
        } catch (error) {
            const isTimeout = error?.code === 'ECONNABORTED' || `${error?.message || ''}`.toLowerCase().includes('timeout')
            return response.status(isTimeout ? 504 : 502).json({
                status: false,
                message: isTimeout ? 'Waktu memuat produk terlaris habis' : (error.message || 'Gagal memuat produk terlaris')
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
			if (res?.data?.error && `${res.data.error}`.toLowerCase().includes('tidak tersedia di marketplace')) {
				return response.status(404).json({ status: false, message: 'Produk tidak tersedia' })
			}
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
