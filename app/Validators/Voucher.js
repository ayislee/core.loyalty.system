'use strict'

class Voucher {
    get rules () {
		return {
			name: "required",
			// sku: "required",
            product_image: "required",
			voucher_image: "required",
            status: "required|in:active,not active",
			description: "required",
            duration: "required|number",
			type: "required|in:free,amount"
		}
	}

	get messages(){
		return {
            "name.required": "name is required",
            "sku.required": "sku is required",
            "status.required": "status is required",
            "status.in": "invalid status",
            "description.required": "description is required",
            "duration.required": "duration is required",
            "duration.number": "invalid value for duration",
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = Voucher