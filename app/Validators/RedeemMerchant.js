'use strict'

class RedeemMerchant {
    get rules () {
		return {
			name: "string|required",
            address: "string|required",
            lat: "string",
            long: "string",
            phone: "msisdn"

		}
	}

	get messages(){
		return {
            "name.required": "name is required",
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = RedeemMerchant