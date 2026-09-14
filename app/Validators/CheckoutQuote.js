'use strict'

class CheckoutQuote {
    get rules () {
        return {
            selected_cart_ids: 'required|array',
            address_id: 'required|integer'
        }
    }

    get messages () {
        return {
            'selected_cart_ids.required': 'selected_cart_ids is required',
            'selected_cart_ids.array': 'selected_cart_ids must be an array',
            'address_id.required': 'address_id is required',
            'address_id.integer': 'address_id must be an integer'
        }
    }

    async fails (errorMessages) {
        return this.ctx.response.status(422).json({
            status: false,
            code: 'INVALID_CHECKOUT_REQUEST',
            message: errorMessages[0].message,
            data: null
        })
    }
}

module.exports = CheckoutQuote
