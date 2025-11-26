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
                    const api = `${Env.get('MARKETPLACE_CORE')}menu/slug/${item.menu_slug}`
                    const res = await axios.get(api)
                    if (res.data && (res.data.success || res.data.data)) {
                        const menuData = res.data.data || {}
                        out.current_price = menuData.current_price || item.current_price || null
                        out.menu_current_quantity = menuData.menu_current_quantity || item.menu_current_quantity || null
                    } else {
                        out.current_price = null
                        out.menu_current_quantity = null
                    }
                } catch (error) {
                    out.current_price = null
                    out.menu_current_quantity = null
                }
                return out
            }))

            const grouped = Object.values(enriched.reduce((acc, item) => {
                const key = item.store_slug || 'unknown'
                if (!acc[key]) {
                    acc[key] = {
                        store_slug: item.store_slug || null,
                        store_name: item.store_name || null,
                        items: []
                    }
                }
                acc[key].items.push(item)
                return acc
            }, {}))

            return response.json({
                status: true,
                data: grouped
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
        .where('cart_id',req.cart_id)
        .first()
        return response.json({
            status: true,
            data: cart
        })
    }

    async create({request, response, auth}){
        const req = request.all()
        let cart
        try {
            cart = await Cart.query()
            .where('member_id',auth.user.member_id)
            .where('item_id',req.item_id)
            .where('store_slug', req.store_slug)
            .first()
            if(cart){
                cart.quantity = req.quantity + cart.quantity
                cart.note = req.note
                cart.menu_slug = req.menu_slug
                cart.item_image = req.item_image
                cart.store_slug = req.store_slug
                cart.store_name = req.store_name
            }else{
                cart = new Cart()
                cart.member_id = auth.user.member_id
                cart.item_id = req.item_id
                cart.item_name = req.item_name
                cart.quantity = req.quantity
                cart.note = req.note
                cart.item_image = req.item_image
                cart.menu_slug = req.menu_slug
                cart.store_slug = req.store_slug
                cart.store_name = req.store_name
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
            const cart = await Cart.find(req.cart_id)
            cart.member_id = auth.user.member_id
            cart.item_id = req.item_id
            cart.item_name = req.item_name?req.item_name:cart.item_name
            cart.quantity = req.quantity?req.quantity:cart.quantity 
            cart.note = req.note?req.note:cart.note
            cart.item_image = req.item_image?req.item_image:cart.item_image
            cart.checked = req.checked ? req.checked : cart.checked
            cart.store_slug = req.store_slug ? req.store_slug : cart.store_slug
            cart.store_name = req.store_name ? req.store_name : cart.store_name
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
            const cart = await Cart.find(req.cart_id)
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
