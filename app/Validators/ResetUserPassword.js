'use strict'

class ResetUserPassword {
    get rules () {
        return {
            password: 'required|string|min:8'
        }
    }

    get messages () {
        return {
            'password.required': 'password is required',
            'password.min': 'password must contain at least 8 characters'
        }
    }

    async fails (errorMessages) {
        return this.ctx.response.json({
            status: false,
            message: errorMessages[0].message
        })
    }
}

module.exports = ResetUserPassword
