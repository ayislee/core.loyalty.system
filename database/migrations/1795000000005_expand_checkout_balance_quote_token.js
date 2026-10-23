'use strict'
const Schema = use('Schema')

class ExpandCheckoutBalanceQuoteToken extends Schema {
    up () { this.table('checkout_balance_confirmations', (t) => t.longText('quote_token').notNullable().alter()) }
    down () { this.table('checkout_balance_confirmations', (t) => t.string('quote_token', 512).notNullable().alter()) }
}

module.exports = ExpandCheckoutBalanceQuoteToken
