'use strict'

class PartnerID {
    get rules () {
		return {
			partner_id: "required|exists:partners,partner_id",
		}
	}

	get messages(){
		return {
			"partner_id.required": "partner_id is required",
            "partner_id.number": "partner_id must number",
            "partner_id.exists": "partner_id is not exists"
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