'use strict'

class UserRegister {
    get rules () {
		return {
			firstname: "string|required",
            lastname: "string|required",
            // phone: "msisdn|required",
			// email: "email|required|unique:users,email",
			// password: "string|required",
			type:"in:partner,admin"
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

module.exports = UserRegister
