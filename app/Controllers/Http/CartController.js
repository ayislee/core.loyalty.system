'use strict'
const Cart = use('App/Models/Cart')
const axios = use('axios')
const Env = use('Env')

class CartController {
    async list({request, response, auth}){
        console.log('[CartController] list called', auth.user.member_id)
        const req = request.all()
        try {
            const carts = await Cart.query()
                .where('member_id',auth.user.member_id)
                .orderBy('cart_id','desc')
                .filter(req.filter)
                .fetch()
            const raw = carts.toJSON()

            const enriched = await Promise.all(raw.map(async (item) => {
                const out = { ...item }
                try {
                    const companySlug = Env.get('DEFAULT_COMPANY_SLUG')
                    const api = `${Env.get('MARKETPLACE_CORE')}company/slug/${companySlug}/item`
                    const res = await axios.get(api, { params: { item_id: item.item_id } })
                    const products = Array.isArray(res?.data?.data) ? res.data.data : []
                    const product = products.find((entry) => `${entry?.item_id}` === `${item.item_id}`) || products[0]
                    if (product) {
                        const menus = Array.isArray(product.menu) ? product.menu : []
                        const representative = menus.slice().sort(
                            (a, b) => Number(b?.menu_current_quantity || 0) - Number(a?.menu_current_quantity || 0)
                        )[0] || {}
                        const internalPlatform = (representative.menu_platform || []).find(
                            (platform) => platform?.ms_merchant_payment?.ms_merchant_payment_identifier === 'INTERNAL_MARKETPLACE'
                        )
                        out.current_price = Number(internalPlatform?.menu_platform_discount_price) ||
                            Number(internalPlatform?.menu_platform_regular_price) ||
                            Number(product.item_discount_price) || Number(product.item_regular_price) || null
                        out.menu_current_quantity = menus.reduce(
                            (highest, menu) => Math.max(highest, Number(menu?.menu_current_quantity) || 0),
                            0
                        )
                        out.item_sku = product.item_sku || item.item_sku || null
                        out.sku = product.item_sku || item.sku || null
                        out.product_sku = product.item_sku || item.product_sku || null
                        out.menu_sku = product.item_sku || item.menu_sku || null
                    } else {
                        out.current_price = null
                        out.menu_current_quantity = null
                        out.item_sku = item.item_sku || null
                        out.sku = item.sku || null
                        out.product_sku = item.product_sku || null
                        out.menu_sku = item.menu_sku || null
                    }
                } catch (error) {
                    out.current_price = null
                    out.menu_current_quantity = null
                    out.item_sku = item.item_sku || null
                    out.sku = item.sku || null
                    out.product_sku = item.product_sku || null
                    out.menu_sku = item.menu_sku || null
                }
                return out
            }))

            // Store is an internal fulfillment concern. Older rows can retain these
            // columns, but marketplace clients always receive one flat cart list.
            const items = enriched.map(({ store_slug, store_name, ...item }) => item)

            return response.json({
                status: true,
                data: items
            })
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async get({request, response, auth}){
        const req = request.all()
        const cart = await Cart.query()
        .where('cart_id',req.cart_id).where('member_id', auth.user.member_id)
        .first()
        if (!cart) return response.status(404).json({ status: false, message: 'cart not found' })
        const { store_slug, store_name, ...safeCart } = cart.toJSON()
        return response.json({
            status: true,
            data: safeCart
        })
    }

    async create({request, response, auth}){
        const req = request.all()
        let cart
        try {
            const duplicateCarts = await Cart.query()
            .where('member_id',auth.user.member_id)
            .where('item_id',req.item_id)
            .fetch()
            const existingCarts = duplicateCarts.toJSON()
            cart = existingCarts[0] ? await Cart.find(existingCarts[0].cart_id) : null
            if(cart){
                cart.quantity = Number(req.quantity || 0) + existingCarts.reduce((total, item) => total + Number(item.quantity || 0), 0)
                cart.note = req.note
                cart.menu_slug = req.menu_slug
                cart.item_image = req.item_image
                cart.checked = '1'
                // Deliberately do not use client supplied store metadata.
                await Promise.all(existingCarts.slice(1).map((item) => Cart.find(item.cart_id).then((duplicate) => duplicate.delete())))
            }else{
                cart = new Cart()
                cart.member_id = auth.user.member_id
                cart.item_id = req.item_id
                cart.item_name = req.item_name
                cart.quantity = req.quantity
                cart.note = req.note
                cart.item_image = req.item_image
                cart.menu_slug = req.menu_slug
                cart.checked = '1'
                // Legacy nullable columns are intentionally left empty for new rows.
            }
        
            
            await cart.save()
            return response.json({
                status: true,
                message: "success"
            })
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async edit({request, response, auth}){
        const req = request.all()
        try {
            const cart = await Cart.query().where('cart_id', req.cart_id).where('member_id', auth.user.member_id).first()
            if (!cart) return response.status(404).json({ status: false, message: 'cart not found' })
            cart.member_id = auth.user.member_id
            cart.item_id = req.item_id
            cart.item_name = req.item_name?req.item_name:cart.item_name
            cart.quantity = req.quantity?req.quantity:cart.quantity 
            cart.note = req.note?req.note:cart.note
            cart.item_image = req.item_image?req.item_image:cart.item_image
            cart.checked = req.checked ? req.checked : cart.checked
            await cart.save()
            return response.json({
                status: true,
                message: "success"
            })
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async delete({request, response, auth}){
        const req = request.all()
        try {
            const cart = await Cart.query().where('cart_id', req.cart_id).where('member_id', auth.user.member_id).first()
            if (!cart) return response.status(404).json({ status: false, message: 'cart not found' })
            await cart.delete()
            return response.json({
                status: true,
                message: "success"
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

module.exports = CartController
