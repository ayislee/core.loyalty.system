'use strict'

class Email {
    get rules () {
		return {
			email: "email",
		}
	}

	get messages(){
		return {
            "email.email" : "invalid email",
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = Email