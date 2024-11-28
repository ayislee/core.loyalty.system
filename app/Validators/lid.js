'use strict'

class lid {
    get rules () {
		return {
			lid: "required|phoneOrEmail",
		}
	}

	get messages(){
		return {
			"lid.required": "lid is required",
            "lid.phoneOrEmail": "invalid phone or email",
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = lid