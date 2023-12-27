'use strict'

class PartnerID {
    get rules () {
		return {
			phone: "required|msisdn",
		}
	}

	get messages(){
		return {
            "phone.required" : "Phone is required",
            "phone.msisdn" : "invalid phone number"
            

		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = PartnerID