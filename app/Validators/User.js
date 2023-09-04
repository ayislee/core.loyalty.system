'use strict'

class User {
    get rules () {
		return {
			email: "required|email|unique:users,email",
			firstname: "required|string",
            lastname: "required|string",
            phone: "required|msisdn|string",
			password: "required"
		}
	}

	get messages(){
		return {
            "status.required": "status is required",
            "status.in": "invalid status",
            "email.email": "invalid email",
            "email.required": "email is required",
            "email.email": "invalid email format",
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

module.exports = User
