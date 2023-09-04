'use strict'

class GetPointID {
    get rules () {
		return {
			get_point_id: "required|exists:get_points,get_point_id",
		}
	}

	get messages(){
		return {
			"get_point_id.required": "get_point_id is required",
            "get_point_id.number": "get_point_id must number",
            "get_point_id.exists": "get_point_id is not exists"
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = GetPointID