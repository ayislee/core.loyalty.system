'use strict'

const Cart = use('App/Models/Cart')
const MarketplaceFulfillmentService = use('App/Services/MarketplaceFulfillmentService')
const MemberStoreService = use('App/Services/MemberStoreService')
const Env = use('Env')

class CartController {
    error (response, error) {
        const known = error instanceof MarketplaceFulfillmentService.Error || (error && error.code && error.status)
        const configurationError = /^DEFAULT_(COMPANY|STORE)_SLUG/.test(`${error?.code || ''}`)
        if (!known) console.error('[CartController]', error?.code || 'UNKNOWN', error?.message || error)
        return response.status(known ? error.status : (configurationError ? 422 : 502)).json({
            status: false,
            code: known ? error.code : (error?.code || 'MARKETPLACE_UPSTREAM_ERROR'),
            message: known ? error.message : (configurationError ? 'Konfigurasi toko marketplace belum lengkap.' : 'Gagal memproses keranjang. Silakan coba lagi.'),
            data: known ? error.data : null
        })
    }

    number (value) { const result = Number(value); return Number.isFinite(result) ? result : 0 }

    async context (member, requestedStoreSlug) {
        // Adding an item must not depend on payment-gateway configuration.
        // The gateway is resolved only at checkout; catalog and cart use the
        // same marketplace company as the active store.
        const configuredCompanySlug = Env.get('DEFAULT_COMPANY_SLUG')
        const resolved = await MemberStoreService.resolve(requestedStoreSlug, configuredCompanySlug)
        if (!resolved.isValid) throw new MarketplaceFulfillmentService.Error('STORE_UNAVAILABLE', 'Toko tidak ditemukan atau tidak tersedia.', 422)
        const service = new MarketplaceFulfillmentService()
        const store = resolved.store || {}
        const storeId = service.value(store, ['store_id', 'id'])
        if (!storeId) throw new MarketplaceFulfillmentService.Error('STORE_UNAVAILABLE', 'Identitas toko tidak tersedia.', 422)
        const companySlug = service.value(store, ['company.company_slug', 'company_slug']) || configuredCompanySlug
        return { service, partnerId: member.default_partner_id || null, companySlug, storeId, storeSlug: resolved.storeSlug, storeName: service.value(store, ['store_name', 'name']) || resolved.storeSlug }
    }

    isLoyaltyMenu (service, menu) {
        const value = service.value(menu, ['is_loyalty', 'menu_is_loyalty'])
        return value === null || ['1', 'true', 'yes'].includes(`${value}`.toLowerCase())
    }

    menuSnapshot (service, menu) {
        const item = menu?.item || {}
        const image = service.value(menu, ['item_image', 'image_url', 'item.item_image'])
        const stock = this.number(service.value(menu, ['menu_current_quantity', 'current_quantity', 'stock', 'quantity']))
        const regular = this.number(service.value(menu, ['menu_regular_price', 'regular_price', 'item_regular_price', 'item.item_regular_price']))
        const discount = this.number(service.value(menu, ['menu_discount_marketplace_price', 'discount_marketplace_price']))
        return {
            menuId: service.value(menu, ['menu_id']), itemId: service.value(menu, ['item_id', 'menu_item_id', 'item.item_id']),
            itemName: service.value(menu, ['item_name', 'menu_name', 'item.item_name']) || item.item_name,
            image: Array.isArray(image) ? image[0] : image, menuSlug: service.value(menu, ['menu_slug', 'item_slug', 'slug', 'item.item_slug']),
            stock, price: discount > 0 && discount < regular ? discount : regular
        }
    }

    async verifiedMenu (context, menuId) {
        const id = Number(menuId)
        if (!Number.isInteger(id) || id <= 0) throw new MarketplaceFulfillmentService.Error('MENU_NOT_AVAILABLE', 'menu_id tidak valid.', 422)
        const menu = (await context.service.getStoreMenu(context.storeSlug)).find((entry) => `${context.service.value(entry, ['menu_id'])}` === `${id}`)
        if (!menu || !this.isLoyaltyMenu(context.service, menu)) throw new MarketplaceFulfillmentService.Error('MENU_NOT_AVAILABLE', 'Produk tidak dijual di toko ini.', 422)
        const snapshot = this.menuSnapshot(context.service, menu)
        if (!snapshot.itemId || snapshot.stock <= 0) throw new MarketplaceFulfillmentService.Error('INSUFFICIENT_STOCK', 'Stok produk sedang tidak tersedia.', 422, { menu_id: id, available_quantity: snapshot.stock })
        return snapshot
    }

    summary (items) {
        return { line_count: items.length, item_count: items.reduce((total, item) => total + this.number(item.quantity), 0), subtotal: items.reduce((total, item) => total + this.number(item.current_price) * this.number(item.quantity), 0) }
    }

    async responseForStore (member, storeSlug) {
        const context = await this.context(member, storeSlug)
        const rows = (await Cart.query().where('member_id', member.member_id).where('store_slug', context.storeSlug).orderBy('cart_id', 'desc').fetch()).toJSON()
        const menus = await context.service.getStoreMenu(context.storeSlug)
        const items = rows.map((cart) => {
            const menu = context.service.menuForCart(menus, cart)
            const snapshot = menu ? this.menuSnapshot(context.service, menu) : null
            return {
                ...cart, item_id: snapshot?.itemId || cart.item_id, item_name: snapshot?.itemName || cart.item_name,
                item_image: snapshot?.image || cart.item_image, menu_slug: snapshot?.menuSlug || cart.menu_slug,
                current_price: snapshot?.price || null, available_quantity: snapshot?.stock ?? 0,
                available: Boolean(snapshot && this.isLoyaltyMenu(context.service, menu) && snapshot.stock >= this.number(cart.quantity))
            }
        })
        return { store: { store_id: context.storeId, store_slug: context.storeSlug, store_name: context.storeName, company_slug: context.companySlug, partner_id: context.partnerId }, items, summary: this.summary(items) }
    }

    async list ({ request, response, auth }) {
        try {
            const storeSlug = request.input('store_slug')
            if (!storeSlug) throw new MarketplaceFulfillmentService.Error('STORE_UNAVAILABLE', 'store_slug wajib diisi.', 422)
            return response.json({ status: true, data: await this.responseForStore(auth.user, storeSlug) })
        } catch (error) { return this.error(response, error) }
    }

    async get ({ request, response, auth }) {
        const cart = await Cart.query().where('cart_id', request.input('cart_id')).where('member_id', auth.user.member_id).first()
        if (!cart) return response.status(404).json({ status: false, code: 'CART_NOT_FOUND', message: 'cart not found' })
        return response.json({ status: true, data: cart.toJSON() })
    }

    async create ({ request, response, auth }) {
        try {
            const req = request.all(); const context = await this.context(auth.user, req.store_slug); const quantity = Number(req.quantity || 1)
            if (!Number.isInteger(quantity) || quantity <= 0) throw new MarketplaceFulfillmentService.Error('INVALID_QUANTITY', 'Jumlah produk tidak valid.', 422)
            const menu = await this.verifiedMenu(context, req.menu_id)
            let cart = await Cart.query().where('member_id', auth.user.member_id).where('store_slug', context.storeSlug).where('menu_id', menu.menuId).first()
            const nextQuantity = quantity + this.number(cart?.quantity)
            if (nextQuantity > menu.stock) throw new MarketplaceFulfillmentService.Error('INSUFFICIENT_STOCK', 'Jumlah melebihi stok yang tersedia.', 422, { menu_id: menu.menuId, available_quantity: menu.stock })
            if (!cart) cart = new Cart()
            Object.assign(cart, { member_id: auth.user.member_id, partner_id: context.partnerId, company_slug: context.companySlug, store_id: context.storeId, store_slug: context.storeSlug, store_name: context.storeName, menu_id: menu.menuId, item_id: menu.itemId, item_name: menu.itemName || 'Produk', item_image: menu.image || null, menu_slug: menu.menuSlug || null, quantity: nextQuantity, note: req.note || cart.note || null, checked: '1', unit_price_snapshot: menu.price, price_checked_at: new Date() })
            await cart.save()
            return response.json({ status: true, message: 'Produk ditambahkan ke keranjang', data: await this.responseForStore(auth.user, context.storeSlug) })
        } catch (error) { return this.error(response, error) }
    }

    async edit ({ request, response, auth }) {
        try {
            const cart = await Cart.query().where('cart_id', request.input('cart_id')).where('member_id', auth.user.member_id).first()
            if (!cart) throw new MarketplaceFulfillmentService.Error('CART_NOT_FOUND', 'Cart tidak ditemukan.', 404)
            const quantity = Number(request.input('quantity'))
            if (!Number.isInteger(quantity) || quantity < 0) throw new MarketplaceFulfillmentService.Error('INVALID_QUANTITY', 'Jumlah produk tidak valid.', 422)
            if (quantity === 0) { const slug = cart.store_slug; await cart.delete(); return response.json({ status: true, message: 'Produk dihapus dari keranjang', data: await this.responseForStore(auth.user, slug) }) }
            const context = await this.context(auth.user, cart.store_slug); const menu = await this.verifiedMenu(context, cart.menu_id)
            if (quantity > menu.stock) throw new MarketplaceFulfillmentService.Error('INSUFFICIENT_STOCK', 'Jumlah melebihi stok yang tersedia.', 422, { menu_id: cart.menu_id, available_quantity: menu.stock })
            Object.assign(cart, { quantity, item_id: menu.itemId, item_name: menu.itemName || cart.item_name, item_image: menu.image || cart.item_image, menu_slug: menu.menuSlug || cart.menu_slug, unit_price_snapshot: menu.price, price_checked_at: new Date() })
            await cart.save()
            return response.json({ status: true, message: 'Keranjang diperbarui', data: await this.responseForStore(auth.user, cart.store_slug) })
        } catch (error) { return this.error(response, error) }
    }

    async delete ({ request, response, auth }) {
        try {
            const cart = await Cart.query().where('cart_id', request.input('cart_id')).where('member_id', auth.user.member_id).first()
            if (!cart) throw new MarketplaceFulfillmentService.Error('CART_NOT_FOUND', 'Cart tidak ditemukan.', 404)
            const slug = cart.store_slug; await cart.delete()
            return response.json({ status: true, message: 'Produk dihapus dari keranjang', data: await this.responseForStore(auth.user, slug) })
        } catch (error) { return this.error(response, error) }
    }
}

module.exports = CartController
