'use strict'

const axios = use('axios')
const Env = use('Env')

const STORE_LIST_CACHE_TTL_MS = 30 * 1000
const storeListCache = new Map()

class MemberStoreService {
    static normalizeStores (payload) {
        const data = payload?.data ?? payload
        if (Array.isArray(data)) return data
        if (Array.isArray(data?.data)) return data.data
        return []
    }

    static async list (companySlug = Env.get('DEFAULT_COMPANY_SLUG')) {
        if (!companySlug) {
            const error = new Error('DEFAULT_COMPANY_SLUG belum dikonfigurasi')
            error.code = 'DEFAULT_COMPANY_SLUG_NOT_CONFIGURED'
            throw error
        }

        const cached = storeListCache.get(companySlug)
        if (cached && cached.expiresAt > Date.now()) {
            return cached.value
        }

        const request = axios
            .get(`${Env.get('MARKETPLACE_CORE')}company/slug/${companySlug}/store`)
            .then((response) => {
                if (response?.data?.error) {
                    const error = new Error(response.data.error)
                    error.code = 'STORE_LIST_UNAVAILABLE'
                    throw error
                }
                return this.normalizeStores(response?.data)
            })

        const entry = {
            expiresAt: Date.now() + STORE_LIST_CACHE_TTL_MS,
            value: request
        }
        storeListCache.set(companySlug, entry)

        try {
            return await request
        } catch (error) {
            if (storeListCache.get(companySlug) === entry) storeListCache.delete(companySlug)
            throw error
        }
    }

    static async findBySlug (slug, companySlug) {
        const response = await axios.get(`${Env.get('MARKETPLACE_CORE')}store/slug/${slug}`)
        if (response?.data?.error) return null
        const store = response?.data?.data || response?.data
        const storeCompanySlug = store?.company?.company_slug || store?.company_slug
        if (!store || (companySlug && storeCompanySlug !== companySlug)) return null
        return store
    }

    static async resolve (requestedSlug, companySlug) {
        const defaultSlug = `${Env.get('DEFAULT_STORE_SLUG') || ''}`.trim()
        if (!defaultSlug) {
            const error = new Error('DEFAULT_STORE_SLUG belum dikonfigurasi')
            error.code = 'DEFAULT_STORE_SLUG_NOT_CONFIGURED'
            throw error
        }

        const stores = await this.list(companySlug)
        const bySlug = (slug) => stores.find((store) => `${store?.store_slug || store?.slug || ''}`.trim() === slug)
        // The company store-list endpoint can exclude a valid store based on
        // marketplace-specific flags (for example, is_loyalty). Validate it
        // directly before declaring a configured slug invalid.
        const findStore = async (slug) => bySlug(slug) || await this.findBySlug(slug, companySlug)
        const defaultStore = await findStore(defaultSlug)
        if (!defaultStore) {
            const error = new Error('DEFAULT_STORE_SLUG tidak ditemukan pada daftar toko')
            error.code = 'DEFAULT_STORE_SLUG_INVALID'
            throw error
        }

        const slug = `${requestedSlug || ''}`.trim() || defaultSlug
        const store = await findStore(slug)
        if (!store) {
            return { store: defaultStore, storeSlug: defaultSlug, isValid: false, stores }
        }

        return { store, storeSlug: slug, isValid: true, stores }
    }
}

module.exports = MemberStoreService
