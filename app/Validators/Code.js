'use strict'

class Code {
    get rules () {
		return {
			code: "required",
		}
	}

	get messages(){
		return {
			"code.required": "code is required",
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = Code
