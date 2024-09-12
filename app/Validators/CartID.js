'use strict'

class CartID {
    get rules () {
		return {
			cart_id: "required|exists:carts,cart_id",
		}
	}

	get messages(){
		return {
			"cart_id.required": "cart_id is required",
            "cart_id.exists": "cart_id is not exists"
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = CartID