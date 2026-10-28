'use strict'

const Cart = use('App/Models/Cart')
const Address = use('App/Models/Address')
const Transaction = use('App/Models/Transaction')
const Env = use('Env')
const axios = use('axios')
const crypto = require('crypto')
const MarketplaceFulfillmentService = use('App/Services/MarketplaceFulfillmentService')
const CompanyPaymentGatewayService = use('App/Services/CompanyPaymentGatewayService')
const WalletService = use('App/Services/WalletService')
const CheckoutBalanceConfirmationService = use('App/Services/CheckoutBalanceConfirmationService')

class CheckoutController {
    marketplaceTimeout () {
        const configured = Number(Env.get('MARKETPLACE_CORE_PAYMENT_TIMEOUT_MS', 25000))
        return Number.isFinite(configured) && configured > 0 ? configured : 25000
    }

    error (response, error) {
        console.error('[CHECKOUT_ERROR]', {
            code: error?.code || null,
            message: error?.message || 'Unknown checkout error',
            status: error?.status || null,
            sql_code: error?.sqlState || error?.errno || null
        })
        if (`${error?.message || ''}`.includes('checkout_balance_confirmations')) {
            return response.status(503).json({ status: false, code: 'BALANCE_CONFIRMATION_STORAGE_ERROR', message: 'Penyimpanan konfirmasi pembayaran saldo belum siap. Periksa log Core [CHECKOUT_ERROR].', data: null })
        }
        const isKnown = error instanceof MarketplaceFulfillmentService.Error ||
            Boolean(error && error.code && error.status)
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
        const contexts = new Set(carts.map((cart) => `${cart.company_slug || ''}:${cart.partner_id || ''}:${cart.store_id || ''}:${cart.store_slug || ''}`))
        if (contexts.size !== 1) throw new MarketplaceFulfillmentService.Error('CART_STORE_MISMATCH', 'Produk checkout harus berasal dari satu toko yang sama.', 409)
        const cartStore = carts[0]
        if (!cartStore.store_slug || !cartStore.store_id || !cartStore.company_slug) {
            throw new MarketplaceFulfillmentService.Error('CART_CONTEXT_MISSING', 'Keranjang lama tidak memiliki informasi toko. Silakan pilih ulang produk.', 409)
        }
        const address = await Address.query().where('address_id', addressId).where('member_id', memberId).first()
        if (!address) throw new MarketplaceFulfillmentService.Error('ADDRESS_NOT_FOUND', 'Alamat pengiriman tidak ditemukan.', 404)
        const service = new MarketplaceFulfillmentService()
        const coordinate = service.normalizeCoordinate(address.coordinate)
        if (!coordinate) throw new MarketplaceFulfillmentService.Error('ADDRESS_COORDINATE_REQUIRED', 'Lengkapi titik lokasi alamat untuk melanjutkan checkout.')
        return { carts, address: address.toJSON(), coordinate, service, cartStore }
    }

    async cashierId (companySlug) {
        try {
            const result = await axios.get(`${Env.get('MARKETPLACE_CORE')}company/slug/${encodeURIComponent(companySlug)}/cashier`, {
                timeout: this.marketplaceTimeout()
            })
            const cashier = result?.data?.data?.[0]
            return cashier ? cashier.cashier_id : null
        } catch (error) {
            return null
        }
    }

    marketplaceRequestHeaders (method, path, payload) {
        const secret = Env.get('MARKETPLACE_CORE_SIGNATURE_SECRET')
        if (!secret) {
            throw new MarketplaceFulfillmentService.Error(
                'MARKETPLACE_CORE_SIGNATURE_NOT_CONFIGURED',
                'Konfigurasi koneksi payment gateway marketplace belum lengkap.',
                502
            )
        }
        const timestamp = `${Math.floor(Date.now() / 1000)}`
        const bodyHash = crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex')
        const signaturePayload = `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`
        return {
            'x-marketplace-source': 'CORE_LOYALTY',
            'x-marketplace-timestamp': timestamp,
            'x-marketplace-signature': crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex')
        }
    }

    async postRetailOrder (payload) {
        const url = `${Env.get('MARKETPLACE_CORE')}transaction/retail/order`
        const path = new URL(url).pathname
        const startedAt = Date.now()
        try {
            const result = await axios.post(url, payload, {
                headers: this.marketplaceRequestHeaders('POST', path, payload),
                timeout: this.marketplaceTimeout()
            })
            console.info('[CHECKOUT_MARKETPLACE_ORDER]', { duration_ms: Date.now() - startedAt, status: result.status })
            return result
        } catch (error) {
            const isTimeout = error?.code === 'ECONNABORTED' || `${error?.message || ''}`.toLowerCase().includes('timeout')
            const upstream = error?.response?.data || {}
            const code = `${isTimeout ? 'MARKETPLACE_UPSTREAM_TIMEOUT' : (upstream.code || upstream.error || 'MARKETPLACE_UPSTREAM_ERROR')}`.slice(0, 100)
            const message = `${isTimeout ? 'Waktu memproses pembayaran habis. Periksa daftar transaksi sebelum mencoba lagi.' : (upstream.message || upstream.error || 'Marketplace gagal memproses payment request.')}`.slice(0, 500)
            const status = isTimeout ? 504 : (Number(error?.response?.status) || 502)
            console.error('[CHECKOUT_MARKETPLACE_ORDER]', { duration_ms: Date.now() - startedAt, status, code, message: error?.message || null })
            const diagnostic = upstream.data && typeof upstream.data === 'object' ? upstream.data : {}
            throw new MarketplaceFulfillmentService.Error(code, message, status, {
                upstream_code: `${diagnostic.upstream_code || code}`.slice(0, 100),
                upstream_status: Number(diagnostic.upstream_status) || status,
                upstream_message: diagnostic.upstream_message
                    ? `${diagnostic.upstream_message}`.slice(0, 500)
                    : null
            })
        }
    }

    buildOrderPayload ({ member, carts, address, selection, request, cashierId }) {
        const item = carts.map((cart) => ({
			menu_id: cart.menu_id || null,
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
            voucher_type: request.voucher_code
                ? (String(request.voucher_code).startsWith('global:') ? 'loyalty_global' : 'loyalty')
                : undefined,
            ms_payment_id: request.ms_payment_id,
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
			delivery_scheduled_at: request.delivery_scheduled_at || null,
            client_request_id: request.client_request_id || null,
            checkout_id: request.client_request_id || null,
            wallet_hold_id: request.wallet_hold_id || null,
            loyalty_balance_amount: Number(request.loyalty_balance_amount || 0),
            gateway_charge_amount: request.gateway_charge_amount === undefined ? null : Number(request.gateway_charge_amount),
            transaction_url_referer: Env.get('APP_URL')
        }
    }

    balanceEnabled () { return `${Env.get('BALANCE_PAYMENT_ENABLED', 'false')}`.toLowerCase() === 'true' }

    async paymentAllocation (memberId, total, request = {}) {
        const wallet = await WalletService.getSummary(memberId)
        const requested = request.use_balance ? Math.max(0, Number(request.balance_amount || wallet.available_balance)) : 0
        if (!Number.isSafeInteger(requested)) throw new MarketplaceFulfillmentService.Error('BALANCE_ALLOCATION_INVALID', 'Nominal saldo tidak valid.')
        if (requested > wallet.available_balance) throw new MarketplaceFulfillmentService.Error('BALANCE_ALLOCATION_CHANGED', 'Saldo tersedia berubah. Silakan tinjau ulang checkout.', 409)
        const applied = Math.min(requested, wallet.available_balance, Number(total || 0))
        return { balance: { available_balance: wallet.available_balance, requested_amount: requested, applied_amount: applied }, payment_allocation: { transaction_total: Number(total || 0), balance_amount: applied, qris_amount: Number(total || 0) - applied, remainder_payment_method: Number(total || 0) - applied > 0 ? 'QRIS' : null } }
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

    quoteResponseData ({ token, address, preview, paymentGateway }) {
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
            selected_payment_gateway: paymentGateway ? {
                ms_payment_id: paymentGateway.ms_payment_id,
                identifier: paymentGateway.identifier,
                name: paymentGateway.ms_payment_name,
                configuration_source: paymentGateway.configuration_source,
                public_configuration: paymentGateway.public_configuration || {}
            } : null,
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

    isInstantShipping (option = {}) {
        return [option.service, option.shipment_method, option.shipment_method_description]
            .some(value => `${value || ''}`.trim().toUpperCase() === 'INSTANT')
    }

    instantShippingOption (options = [], requestedService = null) {
        const instant = options.filter(option => this.isInstantShipping(option))
        if (!instant.length) throw new MarketplaceFulfillmentService.Error('SHIPPING_UNAVAILABLE', 'Pengiriman Instant tidak tersedia untuk alamat ini.', 422)
        if (requestedService && !instant.some(option => `${option.service}` === `${requestedService}`)) {
            throw new MarketplaceFulfillmentService.Error('SHIPPING_UNAVAILABLE', 'Layanan pengiriman yang dipilih tidak tersedia.', 422)
        }
        return instant.find(option => `${option.service}` === `${requestedService}`) || instant[0]
    }

    async quote ({ request, response, auth }) {
        try {
            const req = request.all()
            const context = await this.checkoutContext(auth.user.member_id, req.selected_cart_ids, req.address_id)
            const paymentGateway = await CompanyPaymentGatewayService.resolveForMember({
                member: auth.user,
                partnerId: req.partner_id || null
            })
            const companySlug = context.cartStore.company_slug
            if (paymentGateway.company_slug !== companySlug || `${paymentGateway.partner_id || ''}` !== `${context.cartStore.partner_id || ''}`) {
                throw new MarketplaceFulfillmentService.Error('CART_STORE_MISMATCH', 'Partner atau company cart tidak sesuai.', 409)
            }
            const selectedStore = await context.service.validateSelectedStore({ carts: context.carts, storeSlug: context.cartStore.store_slug, companySlug, paymentType: paymentGateway.ms_payment_id, addressCoordinate: context.coordinate })
            selectedStore.companySlug = companySlug
            const shippingOptions = this.shippingOptions(selectedStore.gosendPayload)
            const selectedShipping = this.instantShippingOption(shippingOptions, req.shipping_service)
            const cashierId = await this.cashierId(companySlug)
            if (!cashierId) throw new MarketplaceFulfillmentService.Error('MARKETPLACE_UPSTREAM_ERROR', 'Data kasir marketplace tidak tersedia.', 502)
            const payload = this.buildOrderPayload({ member: auth.user, carts: context.carts, address: context.address, selection: selectedStore, request: { ...req, ms_payment_id: paymentGateway.ms_payment_id, shipping_service: selectedShipping.service, preview_fee: true }, cashierId })
            const previewResult = await this.postRetailOrder(payload)
            if (!previewResult?.data?.success) throw new MarketplaceFulfillmentService.Error('MARKETPLACE_UPSTREAM_ERROR', previewResult?.data?.error || 'Gagal membuat preview checkout.', 502)
            const previewData = previewResult.data.data || previewResult.data
            const total = Number(previewData.transaction_total_amount || 0)
            const allocation = this.balanceEnabled()
                ? await this.paymentAllocation(auth.user.member_id, total, req)
                : { balance: { available_balance: (await WalletService.getSummary(auth.user.member_id)).available_balance, requested_amount: 0, applied_amount: 0 }, payment_allocation: { transaction_total: total, balance_amount: 0, qris_amount: total, remainder_payment_method: 'QRIS' } }
            const expiresAt = Date.now() + context.service.quoteTtlSeconds * 1000
            const token = context.service.sign({
                member_id: auth.user.member_id, selected_cart_ids: context.carts.map((cart) => cart.cart_id),
                address_id: context.address.address_id, address_coordinate: context.coordinate,
                store_id: selectedStore.storeId, store_slug: selectedStore.storeSlug, company_slug: companySlug, partner_id: paymentGateway.partner_id,
				items: context.carts.map((cart) => ({ cart_id: cart.cart_id, menu_id: cart.menu_id || null, item_id: cart.item_id, quantity: Number(cart.quantity), note: cart.note || null })),
                ms_payment_id: paymentGateway.ms_payment_id, payment_gateway_identifier: paymentGateway.identifier, ms_delivery_id: req.ms_delivery_id || null,
                shipping_service: selectedShipping.service, voucher_code: req.voucher_code || null,
                voucher_type: req.voucher_code ? (String(req.voucher_code).startsWith('global:') ? 'loyalty_global' : 'loyalty') : null,
                balance_amount: allocation.payment_allocation.balance_amount,
                transaction_total: total,
                client_request_id: req.client_request_id || null, expires_at: expiresAt
            })
			const responseData = this.quoteResponseData({ token, address: context.address, preview: previewResult.data.data || previewResult.data, paymentGateway })
			responseData.delivery_schedule = previewData.delivery_schedule || null
            responseData.provider_store_name = context.cartStore.store_name || selectedStore.store?.store_name || selectedStore.store_name || null
            responseData.fulfillment = {
                store_id: selectedStore.storeId,
                store_name: responseData.provider_store_name,
                distance_km: selectedStore.distanceKm,
                maximum_distance_km: context.service.maxDistanceKm
            }
            responseData.shipping_options = shippingOptions
            responseData.selected = { ...responseData.selected, shipping_service: selectedShipping.service }
            responseData.balance = allocation.balance
            responseData.payment_allocation = allocation.payment_allocation
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
            const quotedItems = (quote.items || []).map(item => `${item.cart_id}:${item.menu_id || ''}:${item.item_id || ''}:${Number(item.quantity)}:${item.note || ''}`).sort()
            const currentItems = context.carts.map(item => `${item.cart_id}:${item.menu_id || ''}:${item.item_id || ''}:${Number(item.quantity)}:${item.note || ''}`).sort()
            if (quotedItems.length !== currentItems.length || quotedItems.some((item, index) => item !== currentItems[index])) {
                throw new MarketplaceFulfillmentService.Error('FULFILLMENT_CHANGED', 'Keranjang berubah. Silakan tinjau ulang checkout.', 409)
            }
            if (context.coordinate !== quote.address_coordinate) throw new MarketplaceFulfillmentService.Error('FULFILLMENT_CHANGED', 'Alamat pengiriman berubah. Silakan tinjau ulang pesanan.', 409)
            const paymentGateway = await CompanyPaymentGatewayService.resolveForMember({ member: auth.user, partnerId: quote.partner_id || null })
            if (paymentGateway.company_slug !== quote.company_slug || paymentGateway.identifier !== quote.payment_gateway_identifier || `${paymentGateway.ms_payment_id}` !== `${quote.ms_payment_id}`) {
                throw new MarketplaceFulfillmentService.Error('PAYMENT_GATEWAY_CHANGED', 'Payment gateway company berubah. Silakan tinjau ulang pesanan.', 409)
            }
            if (context.cartStore.company_slug !== quote.company_slug || context.cartStore.store_slug !== quote.store_slug || `${context.cartStore.store_id}` !== `${quote.store_id}`) {
                throw new MarketplaceFulfillmentService.Error('FULFILLMENT_CHANGED', 'Konteks toko keranjang berubah. Silakan tinjau ulang pesanan.', 409)
            }
            const selectedStore = await context.service.validateSelectedStore({ carts: context.carts, storeSlug: quote.store_slug, addressCoordinate: context.coordinate, companySlug: quote.company_slug, paymentType: quote.ms_payment_id })
            if (`${selectedStore.storeId}` !== `${quote.store_id}` || selectedStore.storeSlug !== quote.store_slug) throw new MarketplaceFulfillmentService.Error('FULFILLMENT_CHANGED', 'Stok atau ketersediaan toko berubah. Silakan tinjau ulang pesanan.', 409)
            const selectedShipping = this.instantShippingOption(this.shippingOptions(selectedStore.gosendPayload), quote.shipping_service)
            if (`${selectedShipping.service}` !== `${quote.shipping_service}`) throw new MarketplaceFulfillmentService.Error('FULFILLMENT_CHANGED', 'Layanan pengiriman berubah. Silakan tinjau ulang checkout.', 409)
            selectedStore.companySlug = quote.company_slug
            const cashierId = await this.cashierId(quote.company_slug)
            if (!cashierId) throw new MarketplaceFulfillmentService.Error('MARKETPLACE_UPSTREAM_ERROR', 'Data kasir marketplace tidak tersedia.', 502)
            const total = Number(quote.transaction_total || 0)
            const requestedAmount = Number(req.balance_amount || quote.balance_amount || 0)
            if (this.balanceEnabled() && requestedAmount !== Number(quote.balance_amount || 0)) throw new MarketplaceFulfillmentService.Error('BALANCE_ALLOCATION_CHANGED', 'Pilihan saldo berubah. Silakan buat quote baru.', 409)
            const allocation = this.balanceEnabled()
                ? await this.paymentAllocation(auth.user.member_id, total, { use_balance: Number(quote.balance_amount || 0) > 0, balance_amount: Number(quote.balance_amount || 0) })
                : { payment_allocation: { balance_amount: 0, qris_amount: total } }
            if (allocation.payment_allocation.balance_amount !== Number(quote.balance_amount || 0)) throw new MarketplaceFulfillmentService.Error('BALANCE_ALLOCATION_CHANGED', 'Saldo tersedia berubah. Silakan tinjau ulang checkout.', 409)
            if (allocation.payment_allocation.balance_amount > 0) {
                if (!req.balance_confirmation_id || !req.balance_confirmation_token) {
                    const confirmation = await CheckoutBalanceConfirmationService.request({ member: auth.user, quoteToken: req.quote_token, clientRequestId: quote.client_request_id || req.client_request_id, amount: allocation.payment_allocation.balance_amount })
                    return response.status(202).json({ status: true, message: 'Token konfirmasi pembayaran saldo telah dikirim.', data: { requires_balance_confirmation: true, ...confirmation, payment_allocation: allocation.payment_allocation } })
                }
                await CheckoutBalanceConfirmationService.verify({ memberId: auth.user.member_id, id: req.balance_confirmation_id, token: req.balance_confirmation_token, quoteToken: req.quote_token, clientRequestId: quote.client_request_id || req.client_request_id })
            }
            let balanceHold = null
            if (allocation.payment_allocation.balance_amount > 0) {
                const ttl = Math.max(60, Number(Env.get('WALLET_HOLD_TTL_SECONDS', context.service.quoteTtlSeconds || 900)))
                balanceHold = await WalletService.createHold({ member_id: auth.user.member_id, amount: allocation.payment_allocation.balance_amount, purpose: 'checkout', reference_id: quote.client_request_id || req.client_request_id, idempotency_key: `checkout-hold:${quote.client_request_id || req.client_request_id}`, expires_at: new Date(Date.now() + ttl * 1000) })
            }
            const finalRequest = { ...quote, ...req, ms_payment_id: paymentGateway.ms_payment_id, preview_fee: false, client_request_id: quote.client_request_id || req.client_request_id, wallet_hold_id: balanceHold?.hold?.wallet_hold_id || null, loyalty_balance_amount: allocation.payment_allocation.balance_amount, gateway_charge_amount: allocation.payment_allocation.qris_amount }
            const payload = this.buildOrderPayload({ member: auth.user, carts: context.carts, address: context.address, selection: selectedStore, request: finalRequest, cashierId })
            let result
            try { result = await this.postRetailOrder(payload) } catch (error) {
                if (balanceHold && error.status && error.status < 500) await WalletService.releaseHold({ hold_id: balanceHold.hold.wallet_hold_id, idempotency_key: `checkout-release:${quote.client_request_id || req.client_request_id}`, reason: 'Marketplace order gagal' })
                throw error
            }
            if (!result?.data?.success) {
                if (balanceHold) await WalletService.releaseHold({ hold_id: balanceHold.hold.wallet_hold_id, idempotency_key: `checkout-release:${quote.client_request_id || req.client_request_id}`, reason: 'Marketplace order gagal dibuat' })
                throw new MarketplaceFulfillmentService.Error('MARKETPLACE_ORDER_FAILED', result?.data?.error || 'Gagal membuat pesanan. Silakan coba lagi.', 502, { upstream_message: result?.data?.error || null })
            }
            const transaction = new Transaction()
            transaction.member_id = auth.user.member_id
            transaction.request = JSON.stringify(payload)
            transaction.response = JSON.stringify(result.data)
            transaction.url = `${Env.get('MARKETPLACE_CORE')}transaction/retail/order`
            await transaction.save()
            // Only remove the cart rows included in this successful transaction.
            // Carts from other stores remain available to the member.
            await Cart.query().where('member_id', auth.user.member_id).whereIn('cart_id', quote.selected_cart_ids).delete()
            return response.json({
                status: true,
                message: 'Checkout berhasil diproses',
                data: {
                    transaction: this.sanitize(result.data.data),
                    payment_gateway: result.data.payment_gateway || null,
                    payment_allocation: allocation.payment_allocation,
                    balance_hold_id: balanceHold ? balanceHold.hold.wallet_hold_id : null
                },
                token: result.data.token || null
            })
        } catch (error) {
            if (error instanceof MarketplaceFulfillmentService.Error && ['NO_STORE_WITHIN_RADIUS', 'NO_SINGLE_STORE_CAN_FULFILL_CART', 'GOSEND_DISTANCE_UNAVAILABLE'].includes(error.code)) {
                error.code = 'FULFILLMENT_CHANGED'; error.status = 409; error.message = 'Stok atau ketersediaan toko berubah. Silakan tinjau ulang pesanan.'
            }
            return this.error(response, error)
        }
    }
}

module.exports = CheckoutController
