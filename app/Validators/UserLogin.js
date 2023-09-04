'use strict'

class UserLogin {
    get rules () {
		return {
			email: "email|required|exists:users,email",
			password: "string|required",
		}
	}

	get messages(){
		return {
            "email.email": "invalid email",
            "email.required": "email is required",
            "email.unique": "email already registered"

		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = UserLogin
