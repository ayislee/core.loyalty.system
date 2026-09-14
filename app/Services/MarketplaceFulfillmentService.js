'use strict'

const axios = use('axios')
const Env = use('Env')
const crypto = require('crypto')

class FulfillmentError extends Error {
    constructor (code, message, status = 422, data = null) {
        super(message)
        this.code = code
        this.status = status
        this.data = data
    }
}

class MarketplaceFulfillmentService {
    constructor () {
        this.marketplaceCore = Env.get('MARKETPLACE_CORE')
        const configuredRadius = Number(Env.get('MARKETPLACE_MAX_FULFILLMENT_DISTANCE_KM'))
        this.maxDistanceKm = Number.isFinite(configuredRadius) && configuredRadius > 0 ? configuredRadius : 3
        const configuredTtl = Number(Env.get('MARKETPLACE_CHECKOUT_QUOTE_TTL_SECONDS'))
        this.quoteTtlSeconds = Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : 900
        this.tokenSecret = Env.get('MARKETPLACE_CHECKOUT_TOKEN_SECRET') || Env.get('APP_KEY')
    }

    static get Error () { return FulfillmentError }

    normalizeCoordinate (value) {
        const text = Array.isArray(value) ? value.join(',') : `${value || ''}`
        const parts = text.replace(/\s+/g, '').split(',').map(Number)
        if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part)) || Math.abs(parts[0]) > 90 || Math.abs(parts[1]) > 180) return null
        return `${parts[0]},${parts[1]}`
    }

    unwrap (payload) {
        if (!payload || typeof payload !== 'object') return payload
        return payload.data && typeof payload.data === 'object' ? payload.data : payload
    }

    value (object, keys) {
        for (const key of keys) {
            const value = key.split('.').reduce((item, part) => item && item[part], object)
            if (value !== undefined && value !== null && `${value}`.trim() !== '') return value
        }
        return null
    }

    async request (method, path, options = {}) {
        try {
            return await axios({ method, url: `${this.marketplaceCore}${path}`, ...options })
        } catch (error) {
            throw new FulfillmentError('MARKETPLACE_UPSTREAM_ERROR', 'Gagal membaca data marketplace. Silakan coba lagi.', 502, null)
        }
    }

    async getStores (companySlug) {
        const response = await this.request('get', `company/slug/${encodeURIComponent(companySlug)}/store`)
        if (response.data && response.data.error) throw new FulfillmentError('MARKETPLACE_UPSTREAM_ERROR', response.data.error, 502)
        const data = this.unwrap(response.data)
        return Array.isArray(data) ? data : (Array.isArray(data && data.stores) ? data.stores : [])
    }

    async getStoreMenu (storeSlug) {
        const response = await this.request('get', `store/slug/${encodeURIComponent(storeSlug)}/menu`)
        if (response.data && response.data.error) return []
        const data = this.unwrap(response.data)
        if (Array.isArray(data)) return data
        if (Array.isArray(data && data.menu)) return data.menu
        if (data && data.menu && typeof data.menu === 'object') return Object.values(data.menu).flatMap((items) => Array.isArray(items) ? items : [])
        return []
    }

    extractDistanceKm (payload) {
        const walk = (value, key = '') => {
            if (value === null || value === undefined) return null
            if (typeof value === 'number' || typeof value === 'string') {
                const raw = `${value}`
                if (!/[0-9]/.test(raw)) return null
                const number = Number(raw.replace(/[^0-9.-]/g, ''))
                if (!Number.isFinite(number) || number < 0) return null
                return /meter|\bm\b/i.test(key) ? number / 1000 : number
            }
            if (typeof value !== 'object') return null
            for (const [childKey, child] of Object.entries(value)) {
                if (/distance|jarak/i.test(childKey)) {
                    const found = walk(child, childKey)
                    if (found !== null) return found
                }
            }
            for (const [childKey, child] of Object.entries(value)) {
                const found = walk(child, childKey)
                if (found !== null) return found
            }
            return null
        }
        return walk(payload)
    }

    async getGoSendDistance (origin, destination, paymentType) {
        let response
        try {
            response = await axios.get(`${this.marketplaceCore}transaction/shipping/gosend/cost`, {
                params: { origin, destination, paymentType }
            })
        } catch (error) {
            return { upstreamFailed: true, distanceKm: null, payload: null }
        }
        const payload = response.data
        if (payload && (payload.error || payload.success === false)) return { upstreamFailed: false, distanceKm: null, payload }
        return { upstreamFailed: false, distanceKm: this.extractDistanceKm(payload), payload }
    }

    menuForCart (menu, cart) {
        return menu.find((entry) => `${this.value(entry, ['item_id', 'menu_item_id', 'item.item_id'])}` === `${cart.item_id}`) ||
            menu.find((entry) => cart.menu_slug && `${this.value(entry, ['menu_slug', 'item_slug', 'slug'])}` === `${cart.menu_slug}`)
    }

    isActiveStore (store) {
        const status = `${this.value(store, ['store_status', 'status', 'is_active', 'active']) || ''}`.toLowerCase()
        return !status || ['active', '1', 'true', 'open'].includes(status)
    }

    async selectStore ({ carts, addressCoordinate, companySlug, paymentType }) {
        const stores = await this.getStores(companySlug)
        if (!stores.length) throw new FulfillmentError('NO_STORE_WITHIN_RADIUS', 'Tidak ada toko yang dapat melayani alamat ini.')
        let distanceUnavailable = 0
        let upstreamFailures = 0
        const candidates = []
        for (const store of stores) {
            if (!this.isActiveStore(store)) continue
            const slug = this.value(store, ['store_slug', 'slug'])
            const storeId = this.value(store, ['store_id', 'id'])
            const coordinate = this.normalizeCoordinate(
                this.value(store, ['store_coordinate', 'coordinate', 'store.coordinate', 'address_coordinate']) ||
                ((this.value(store, ['store_lat', 'latitude', 'lat']) !== null && this.value(store, ['store_long', 'longitude', 'lng', 'long']) !== null)
                    ? `${this.value(store, ['store_lat', 'latitude', 'lat'])},${this.value(store, ['store_long', 'longitude', 'lng', 'long'])}`
                    : null)
            )
            if (!slug || !storeId || !coordinate) continue
            const distance = await this.getGoSendDistance(coordinate, addressCoordinate, paymentType)
            if (distance.upstreamFailed) { upstreamFailures += 1; continue }
            if (distance.distanceKm === null) { distanceUnavailable += 1; continue }
            if (distance.distanceKm > this.maxDistanceKm) continue
            const menu = await this.getStoreMenu(slug)
            const unavailable = carts.map((cart) => {
                const item = this.menuForCart(menu, cart)
                const stock = Number(this.value(item, ['menu_current_quantity', 'current_quantity', 'stock', 'quantity']) || 0)
                return !item || stock < Number(cart.quantity) ? {
                    cart_id: cart.cart_id, item_id: cart.item_id, item_name: cart.item_name,
                    requested_quantity: Number(cart.quantity), available_quantity: item ? stock : 0,
                    reason: item ? 'INSUFFICIENT_STOCK' : 'ITEM_NOT_AVAILABLE'
                } : null
            }).filter(Boolean)
            if (unavailable.length) continue
            const stockRemaining = carts.reduce((total, cart) => {
                const item = this.menuForCart(menu, cart)
                return total + Number(this.value(item, ['menu_current_quantity', 'current_quantity', 'stock', 'quantity']) || 0) - Number(cart.quantity)
            }, 0)
            candidates.push({ store, storeId, storeSlug: slug, coordinate, distanceKm: distance.distanceKm, gosendPayload: distance.payload, menu, stockRemaining })
        }
        if (!candidates.length) {
            if (upstreamFailures && upstreamFailures === stores.length) throw new FulfillmentError('MARKETPLACE_UPSTREAM_ERROR', 'Gagal menghitung jarak pengiriman.', 502)
            if (distanceUnavailable && distanceUnavailable + upstreamFailures === stores.length) throw new FulfillmentError('GOSEND_DISTANCE_UNAVAILABLE', 'Jarak pengiriman belum tersedia untuk alamat ini.')
            throw new FulfillmentError('NO_SINGLE_STORE_CAN_FULFILL_CART', 'Tidak ada satu toko yang dapat memenuhi seluruh pesanan.', 422, { unavailable_items: carts.map((cart) => ({ cart_id: cart.cart_id, item_id: cart.item_id, item_name: cart.item_name, requested_quantity: Number(cart.quantity), reason: 'ITEM_NOT_AVAILABLE' })) })
        }
        return candidates.sort((a, b) => a.distanceKm - b.distanceKm || b.stockRemaining - a.stockRemaining || `${a.storeId}`.localeCompare(`${b.storeId}`))[0]
    }

    sign (payload) {
        if (!this.tokenSecret) throw new FulfillmentError('MARKETPLACE_UPSTREAM_ERROR', 'Konfigurasi checkout belum lengkap.', 502)
        const key = crypto.createHash('sha256').update(this.tokenSecret).digest()
        const iv = crypto.randomBytes(12)
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
        const encode = (value) => Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
        return `v1.${encode(iv)}.${encode(encrypted)}.${encode(cipher.getAuthTag())}`
    }

    verify (token) {
        const [version, iv, encrypted, tag] = `${token || ''}`.split('.')
        if (version !== 'v1' || !iv || !encrypted || !tag || !this.tokenSecret) throw new FulfillmentError('INVALID_QUOTE_TOKEN', 'Data checkout tidak valid. Silakan ulangi checkout dari keranjang.')
        try {
            const decode = (value) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
            const key = crypto.createHash('sha256').update(this.tokenSecret).digest()
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, decode(iv))
            decipher.setAuthTag(decode(tag))
            const payload = JSON.parse(Buffer.concat([decipher.update(decode(encrypted)), decipher.final()]).toString('utf8'))
            if (!payload.expires_at || payload.expires_at < Date.now()) throw new FulfillmentError('QUOTE_EXPIRED', 'Sesi checkout sudah kedaluwarsa. Silakan tinjau ulang pesanan.', 422, { expired: true })
            return payload
        } catch (error) {
            if (error instanceof FulfillmentError) throw error
            throw new FulfillmentError('INVALID_QUOTE_TOKEN', 'Data checkout tidak valid. Silakan ulangi checkout dari keranjang.')
        }
    }
}

module.exports = MarketplaceFulfillmentService
