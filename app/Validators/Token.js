'use strict'

class Token {
    get rules () {
		return {
			token: "required|number|min:6|max:6",
		}
	}

	get messages(){
		return {
            "token.required": "token is required",
            "token.number": "invalid token",
            "token.min": "invalid token",
            "token.max": "invalid token",
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = Token