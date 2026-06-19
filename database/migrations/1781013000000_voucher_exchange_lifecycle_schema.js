'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class VoucherExchangeLifecycleSchema extends Schema {
    up() {
        this.table('voucher_exchanges', (table) => {
            table.index(
                ['member_voucher_id'],
                'voucher_exchanges_member_voucher_id_index'
            )
        })

        this.table('voucher_exchanges', (table) => {
            table.dropUnique(['member_voucher_id', 'redeem_merchant_id'])
            table.integer('store_id').unsigned().nullable().index()
            table.string('external_transaction_id', 100).nullable().index()
            table.string('external_transaction_number', 100).nullable().index()
            table.enu('lifecycle_status', ['exchanged', 'returned']).notNullable().defaultTo('exchanged').index()
            table.datetime('exchanged_at').nullable()
            table.datetime('returned_at').nullable()
            table.string('return_reason', 255).nullable()
            table.unique(
                ['member_voucher_id', 'external_transaction_id'],
                'voucher_exchanges_member_transaction_unique'
            )
        })

        this.raw('ALTER TABLE voucher_exchanges MODIFY redeem_merchant_id INT UNSIGNED NULL')

        this.raw(`
            UPDATE voucher_exchanges
            SET exchanged_at = COALESCE(exchanged_at, created_at)
            WHERE lifecycle_status = 'exchanged'
        `)
    }

    down() {
        this.table('voucher_exchanges', (table) => {
            table.dropUnique(
                ['member_voucher_id', 'external_transaction_id'],
                'voucher_exchanges_member_transaction_unique'
            )
            table.dropColumn('return_reason')
            table.dropColumn('returned_at')
            table.dropColumn('exchanged_at')
            table.dropColumn('lifecycle_status')
            table.dropColumn('external_transaction_number')
            table.dropColumn('external_transaction_id')
            table.dropColumn('store_id')
            table.unique(['member_voucher_id', 'redeem_merchant_id'])
        })

        this.table('voucher_exchanges', (table) => {
            table.dropIndex(
                ['member_voucher_id'],
                'voucher_exchanges_member_voucher_id_index'
            )
        })
    }
}

module.exports = VoucherExchangeLifecycleSchema
