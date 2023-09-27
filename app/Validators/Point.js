'use strict'

class Point {
    get rules () {
		return {
			point: "required|number",
            description: "required"
		}
	}

	get messages(){
		return {
            "point.required": "point is required",
            "point.number": "point must number",
            "description": "description is required"
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = Point