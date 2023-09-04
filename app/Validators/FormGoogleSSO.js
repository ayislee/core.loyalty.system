"use strict";

class FormGoogleSSO {
	get rules() {
		return {
			id_token: "required"
		};
	}
	get messages() {
		return {
			"id_token.required": "Token is required"
		};
	}
	async fails(errorMessages) {
		return this.ctx.response.json({ 
            status: false,
            message: errorMessages[0].message 
        });
	}
}

module.exports = FormGoogleSSO;