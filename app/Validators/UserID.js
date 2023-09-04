'use strict'

class UserID {
    get rules () {
		return {
			user_id: "required|exists:users,user_id",
		}
	}

	get messages(){
		return {
			"user_id.required": "user_id is required",
            "user_id.number": "user_id must number",
            "user_id.exists": "user_id is not exists"
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = UserID
