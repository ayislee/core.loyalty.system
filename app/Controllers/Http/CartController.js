'use strict'
const Cart = use('App/Models/Cart')
const axios = use('axios')
const Env = use('Env')

class CartController {
    async list({request, response, auth}){
        const req = request.all()
        const cart = await Cart.query()
        .where('member_id',auth.user.member_id)
        .orderBy('cart_id','desc')
        .paginate(req.page, req.rows)
        const djson = cart.toJSON()
        const outdata = []
        console.log(djson.data)
        for (const key in djson.data) {
            let api = `${Env.get('MARKETPLACE_CORE')}menu/slug/${djson.data[key].menu_slug}`
            console.log(key)
            try {
                console.log(api)

                let res = await axios.get(api)
                console.log(res.data)
                if(res.data.success){
                    djson.data[key].current_price = res.data.data.current_price
                    djson.data[key].menu_current_quantity = res.data.data.menu_current_quantity
                }else{
                    djson.data[key].current_price = null
                    djson.data[key].menu_current_quantity = res.data.data.menu_current_quantity
                }
    
                   
            } catch (error) {
                djson.data[key].current_price = null
                djson.data[key].menu_current_quantity = null
                
            }

        }
        return response.json({
            status: true,
            data: djson
        })
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
            .first()
            if(cart){
                cart.quantity = req.quantity + cart.quantity
                cart.note = req.note
                cart.menu_slug = req.menu_slug
                cart.item_image = req.item_image
            }else{
                cart = new Cart()
                cart.member_id = auth.user.member_id
                cart.item_id = req.item_id
                cart.item_name = req.item_name
                cart.quantity = req.quantity
                cart.note = req.note
                cart.item_image = req.item_image
                cart.menu_slug = req.menu_slug
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
