'use strict'

class SendPoint {
    get rules () {
		return {
			point: "number|required",
            ref: "required"

		}
	}

	get messages(){
		return {
            "point.required": "point is required",
			"ref.required": "refference is required"
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = SendPoint