'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class VoucherRedeemConfirmationSchema extends Schema {
    up() {
        this.create('voucher_redeem_confirmations', (table) => {
            table.increments('voucher_redeem_confirmation_id')
            table.integer('member_id').notNullable().unsigned().references('member_id').inTable('members')
            table.integer('voucher_id').notNullable().unsigned().references('voucher_id').inTable('vouchers')
            table.integer('point_history_id').unsigned()
            table.integer('member_voucher_id').unsigned()
            table.string('token_hash', 100).notNullable()
            table.string('channels', 50).notNullable()
            table.decimal('point', 12, 2).unsigned().notNullable()
            table.enu('status', ['pending', 'confirmed', 'expired', 'cancelled']).notNullable().defaultTo('pending')
            table.datetime('token_valid_until').notNullable()
            table.datetime('confirmed_at')
            table.datetime('released_at')
            table.timestamps()
            table.datetime('deleted_at')
            table.index(['status', 'token_valid_until'])
            table.index(['member_id', 'voucher_id', 'status'])
        })
    }

    down() {
        this.drop('voucher_redeem_confirmations')
    }
}

module.exports = VoucherRedeemConfirmationSchema
