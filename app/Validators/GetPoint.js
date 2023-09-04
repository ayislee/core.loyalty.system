'use strict'

class Getpoint {
    get rules () {
		return {
			name: "required",
            code: "required|min:3|max:3",
            point_receive: "number|required",
            desc: "string|required"
		}
	}

	get messages(){
		return {
            "name.required": "name is required",
            "code.required": "code is required",
            "code.min": "name minimum 3 character",
            "code.max": "max minimum 3 character",
            "point_receive.required": "point_received is required",
            "point_receive.number": "point_received must number",
            "desc.required": "description is required"
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = Getpoint