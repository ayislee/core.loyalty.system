'use strict'

class Partner {
    get rules () {
		return {
			name: "string|required",
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

module.exports = Partner
