'use strict'

class Pages {
	get rules () {
		return {
			page: "required|number",
            rows: "required|number",
		}
	}

	get messages(){
		return {
			"page.required": "Page is required",
        	"page.number": "Page must number format",
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = Pages