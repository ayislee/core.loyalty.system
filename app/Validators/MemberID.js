'use strict'

class MemberID {
    get rules () {
		return {
			member_id: "required|exists:members,member_id",
		}
	}

	get messages(){
		return {
			"member_id.required": "member_id is required",
            "member_id.number": "member_id must number",
            "member_id.exists": "member_id is not exists"
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = MemberID
