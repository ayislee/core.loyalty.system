'use strict'

class Message {
    get rules () {
		return {
			message: "required",
		}
	}

	get messages(){
		return {
			"message.required": "message is required",
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = Message
