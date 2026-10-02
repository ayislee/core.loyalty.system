'use strict'

class Token {
    get rules () {
		return {
			token: "required|number|min:6|max:6",
		}
	}

	get messages(){
		return {
            "token.required": "Kode OTP wajib diisi",
            "token.number": "Kode OTP tidak valid",
            "token.min": "Kode OTP tidak valid",
            "token.max": "Kode OTP tidak valid",
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
