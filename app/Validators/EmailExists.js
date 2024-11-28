'use strict'

class EmailExists {
    get rules () {
		return {
			email: "email|exists:members,email",
		}
	}

	get messages(){
		return {
            "email.exists" : "invalid email",
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = EmailExists