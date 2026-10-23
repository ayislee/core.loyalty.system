'use strict'

class CheckoutCommit {
    get rules () {
        return { quote_token: 'required|string', use_balance: 'boolean', balance_amount: 'integer|min:0' }
    }

    get messages () {
        return { 'quote_token.required': 'quote_token is required' }
    }

    async fails (errorMessages) {
        return this.ctx.response.status(422).json({
            status: false,
            code: 'INVALID_QUOTE_TOKEN',
            message: errorMessages[0].message,
            data: null
        })
    }
}

module.exports = CheckoutCommit
