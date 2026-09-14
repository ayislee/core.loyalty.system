'use strict'

const Cart = use('App/Models/Cart')
const Address = use('App/Models/Address')
const Partner = use('App/Models/Partner')
const Transaction = use('App/Models/Transaction')
const Env = use('Env')
const axios = use('axios')
const MarketplaceFulfillmentService = use('App/Services/MarketplaceFulfillmentService')

class CheckoutController {
    error (response, error) {
        const isKnown = error instanceof MarketplaceFulfillmentService.Error
        return response.status(isKnown ? error.status : 502).json({
            status: false,
            code: isKnown ? error.code : 'MARKETPLACE_UPSTREAM_ERROR',
            message: isKnown ? error.message : 'Gagal memproses checkout. Silakan coba lagi.',
            data: isKnown ? error.data : null
        })
    }

    async checkoutContext (memberId, selectedCartIds, addressId) {
        const ids = [...new Set((selectedCartIds || []).map(Number).filter(Number.isInteger))]
        if (!ids.length) throw new MarketplaceFulfillmentService.Error('EMPTY_CART_SELECTION', 'Pilih minimal satu produk untuk checkout.')
        const carts = (await Cart.query().where('member_id', memberId).whereIn('cart_id', ids).fetch()).toJSON()
        if (carts.length !== ids.length) throw new MarketplaceFulfillmentService.Error('FULFILLMENT_CHANGED', 'Keranjang berubah. Silakan tinjau ulang pesanan.', 409)
        const address = await Address.query().where('address_id', addressId).where('member_id', memberId).first()
        if (!address) throw new MarketplaceFulfillmentService.Error('ADDRESS_NOT_FOUND', 'Alamat pengiriman tidak ditemukan.', 404)
        const service = new MarketplaceFulfillmentService()
        const coordinate = service.normalizeCoordinate(address.coordinate)
        if (!coordinate) throw new MarketplaceFulfillmentService.Error('ADDRESS_COORDINATE_REQUIRED', 'Lengkapi titik lokasi alamat untuk melanjutkan checkout.')
        return { carts, address: address.toJSON(), coordinate, service }
    }

    async companySlug (member) {
        const partner = member.default_partner_id
            ? await Partner.query().where('partner_id', member.default_partner_id).first()
            : null
        return Env.get('DEFAULT_COMPANY_SLUG') || (partner && partner.company_slug) || null
    }

    async cashierId (companySlug) {
        try {
            const result = await axios.get(`${Env.get('MARKETPLACE_CORE')}company/slug/${encodeURIComponent(companySlug)}/cashier`)
            const cashier = result?.data?.data?.[0]
            return cashier ? cashier.cashier_id : null
        } catch (error) {
            return null
        }
    }

    buildOrderPayload ({ member, carts, address, selection, request, cashierId }) {
        const item = carts.map((cart) => ({
            item_id: cart.item_id,
            menu_slug: cart.menu_slug,
            item_name: cart.item_name,
            quantity: Number(cart.quantity),
            note: cart.note || null
        }))
        return {
            item,
            store_id: selection.storeId,
            store_slug: selection.storeSlug,
            company_slug: selection.companySlug,
            voucher_code: request.voucher_code || null,
            voucher_type: request.voucher_code ? 'loyalty' : undefined,
            ms_payment_id: request.ms_payment_id || Env.get('MARKETPLACE_CORE_PAYMENT_ID') || Env.get('MS_PAYMENT_ID') || 4,
            ms_delivery_id: request.ms_delivery_id || null,
            shipping_service: request.shipping_service || null,
            shiping_method: request.shipping_service || null,
            preview_fee: Boolean(request.preview_fee),
            customer_name: `${member.firstname || 'John'}${member.lastname ? ` ${member.lastname}` : ''}`,
            customer_msisdn: member.phone,
            customer_email: member.email,
            cashier_id: cashierId,
            shipping_destination: address.address_id,
            shipping_destination_name: address.address_name,
            shipping_destination_address: address.full_address,
            shipping_destination_coordinate: address.coordinate,
            transaction_delivery_note: request.transaction_delivery_note || null,
            client_request_id: request.client_request_id || null,
            checkout_id: request.client_request_id || null,
            transaction_url_referer: Env.get('APP_URL')
        }
    }

    sanitize (value) {
        if (Array.isArray(value)) return value.map((item) => this.sanitize(item))
        if (!value || typeof value !== 'object') return value
        return Object.entries(value).reduce((result, [key, item]) => {
            if (/^(store(_id|_slug|_name|_address|_coordinate)?|origin|company_slug)$/i.test(key)) return result
            result[key] = this.sanitize(item)
            return result
        }, {})
    }

    quoteResponseData ({ token, address, preview }) {
        const safePreview = this.sanitize(preview)
        return {
            quote_token: token,
            quote_status: 'ready',
            address: { address_id: address.address_id, address_name: address.address_name, full_address: address.full_address, coordinate: address.coordinate },
            payment_options: safePreview.payment_options || safePreview.payment_method || [],
            delivery_options: safePreview.delivery_options || safePreview.delivery_method || [],
            shipping_options: safePreview.shipping_options || safePreview.shipping_service_options || safePreview.shipping_service_detail || [],
            selected: safePreview.selected || {},
            summary: {
                transaction_amount: safePreview.transaction_amount || 0,
                transaction_discount: safePreview.transaction_discount || 0,
                transaction_shipping_fee: safePreview.transaction_shipping_fee || 0,
                transaction_total_amount: safePreview.transaction_total_amount || 0
            },
            marketplace_preview: safePreview,
            provider_store_name: preview.provider_store_name || null,
            unavailable_items: []
        }
    }

    shippingOptions (payload) {
        const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload
        if (!data || typeof data !== 'object') return []
        return Object.entries(data).map(([key, option]) => {
            if (!option || typeof option !== 'object' || !option.price) return null
            if (option.active === false || option.serviceable === false) return null
            return {
                service: key,
                shipment_method: option.shipment_method || key,
                shipment_method_description: option.shipment_method_description || '',
                distance: option.distance,
                price: option.price
            }
        }).filter(Boolean)
    }

    async quote ({ request, response, auth }) {
        try {
            const req = request.all()
            const context = await this.checkoutContext(auth.user.member_id, req.selected_cart_ids, req.address_id)
            const companySlug = await this.companySlug(auth.user)
            if (!companySlug) throw new MarketplaceFulfillmentService.Error('MARKETPLACE_UPSTREAM_ERROR', 'Konfigurasi marketplace belum lengkap.', 502)
            const selectedStore = await context.service.selectStore({ carts: context.carts, addressCoordinate: context.coordinate, companySlug, paymentType: req.ms_payment_id })
            selectedStore.companySlug = companySlug
            const shippingOptions = this.shippingOptions(selectedStore.gosendPayload)
            if (!shippingOptions.length) throw new MarketplaceFulfillmentService.Error('SHIPPING_UNAVAILABLE', 'Jasa pengiriman tidak tersedia untuk alamat ini.')
            const selectedShipping = shippingOptions.find((option) => option.service === req.shipping_service) || shippingOptions[0]
            const cashierId = await this.cashierId(companySlug)
            if (!cashierId) throw new MarketplaceFulfillmentService.Error('MARKETPLACE_UPSTREAM_ERROR', 'Data kasir marketplace tidak tersedia.', 502)
            const payload = this.buildOrderPayload({ member: auth.user, carts: context.carts, address: context.address, selection: selectedStore, request: { ...req, shipping_service: selectedShipping.service, preview_fee: true }, cashierId })
            const previewResult = await axios.post(`${Env.get('MARKETPLACE_CORE')}transaction/retail/order`, payload)
            if (!previewResult?.data?.success) throw new MarketplaceFulfillmentService.Error('MARKETPLACE_UPSTREAM_ERROR', previewResult?.data?.error || 'Gagal membuat preview checkout.', 502)
            const expiresAt = Date.now() + context.service.quoteTtlSeconds * 1000
            const token = context.service.sign({
                member_id: auth.user.member_id, selected_cart_ids: context.carts.map((cart) => cart.cart_id),
                address_id: context.address.address_id, address_coordinate: context.coordinate,
                store_id: selectedStore.storeId, store_slug: selectedStore.storeSlug, company_slug: companySlug,
                items: context.carts.map((cart) => ({ cart_id: cart.cart_id, item_id: cart.item_id, quantity: Number(cart.quantity), note: cart.note || null })),
                ms_payment_id: req.ms_payment_id || null, ms_delivery_id: req.ms_delivery_id || null,
                shipping_service: selectedShipping.service, voucher_code: req.voucher_code || null,
                client_request_id: req.client_request_id || null, expires_at: expiresAt
            })
            const responseData = this.quoteResponseData({ token, address: context.address, preview: previewResult.data.data || previewResult.data })
            responseData.provider_store_name = selectedStore.store?.store_name || selectedStore.store_name || null
            responseData.shipping_options = shippingOptions
            responseData.selected = { ...responseData.selected, shipping_service: selectedShipping.service }
            return response.json({ status: true, message: 'Checkout quote berhasil dibuat', data: responseData })
        } catch (error) { return this.error(response, error) }
    }

    async commit ({ request, response, auth }) {
        try {
            const req = request.all()
            const service = new MarketplaceFulfillmentService()
            const quote = service.verify(req.quote_token)
            if (`${quote.member_id}` !== `${auth.user.member_id}`) throw new MarketplaceFulfillmentService.Error('INVALID_QUOTE_TOKEN', 'Data checkout tidak valid. Silakan ulangi checkout dari keranjang.')
            if (quote.client_request_id && req.client_request_id && quote.client_request_id !== req.client_request_id) throw new MarketplaceFulfillmentService.Error('INVALID_QUOTE_TOKEN', 'Data checkout tidak valid. Silakan ulangi checkout dari keranjang.')
            const context = await this.checkoutContext(auth.user.member_id, quote.selected_cart_ids, quote.address_id)
            if (context.coordinate !== quote.address_coordinate) throw new MarketplaceFulfillmentService.Error('FULFILLMENT_CHANGED', 'Alamat pengiriman berubah. Silakan tinjau ulang pesanan.', 409)
            const selectedStore = await context.service.selectStore({ carts: context.carts, addressCoordinate: context.coordinate, companySlug: quote.company_slug, paymentType: quote.ms_payment_id })
            if (`${selectedStore.storeId}` !== `${quote.store_id}` || selectedStore.storeSlug !== quote.store_slug) throw new MarketplaceFulfillmentService.Error('FULFILLMENT_CHANGED', 'Stok atau ketersediaan toko berubah. Silakan tinjau ulang pesanan.', 409)
            selectedStore.companySlug = quote.company_slug
            const cashierId = await this.cashierId(quote.company_slug)
            if (!cashierId) throw new MarketplaceFulfillmentService.Error('MARKETPLACE_UPSTREAM_ERROR', 'Data kasir marketplace tidak tersedia.', 502)
            const finalRequest = { ...quote, ...req, preview_fee: false, client_request_id: quote.client_request_id || req.client_request_id }
            const payload = this.buildOrderPayload({ member: auth.user, carts: context.carts, address: context.address, selection: selectedStore, request: finalRequest, cashierId })
            const result = await axios.post(`${Env.get('MARKETPLACE_CORE')}transaction/retail/order`, payload)
            if (!result?.data?.success) throw new MarketplaceFulfillmentService.Error('MARKETPLACE_ORDER_FAILED', result?.data?.error || 'Gagal membuat pesanan. Silakan coba lagi.', 502, { upstream_message: result?.data?.error || null })
            const transaction = new Transaction()
            transaction.member_id = auth.user.member_id
            transaction.request = JSON.stringify(payload)
            transaction.response = JSON.stringify(result.data)
            transaction.url = `${Env.get('MARKETPLACE_CORE')}transaction/retail/order`
            await transaction.save()
            return response.json({ status: true, message: 'Checkout berhasil diproses', data: { transaction: this.sanitize(result.data.data) }, token: result.data.token || null })
        } catch (error) {
            if (error instanceof MarketplaceFulfillmentService.Error && ['NO_STORE_WITHIN_RADIUS', 'NO_SINGLE_STORE_CAN_FULFILL_CART', 'GOSEND_DISTANCE_UNAVAILABLE'].includes(error.code)) {
                error.code = 'FULFILLMENT_CHANGED'; error.status = 409; error.message = 'Stok atau ketersediaan toko berubah. Silakan tinjau ulang pesanan.'
            }
            return this.error(response, error)
        }
    }
}

module.exports = CheckoutController
