'use strict'

class Pages {
	get rules () {
		return {
			redeem_merchant_id: "required|exists:redeem_merchants,redeem_merchant_id",
		}
	}

	get messages(){
		return {
			"redeem_merchant_id.required": "redeem_merchant_id is required",
        	"redeem_merchant_id.number": "redeem_merchant_id must number format",
            "redeem_merchant_id.exists": "redeem_merchant_id not found",
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = Pages