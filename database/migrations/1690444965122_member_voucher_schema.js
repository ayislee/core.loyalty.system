'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class MemberVoucherSchema extends Schema {
    up() {
        this.create('member_vouchers', (table) => {
            table.increments('member_voucher_id')
            table.integer('member_id').notNullable().unsigned().references('member_id').inTable('members')
            table.integer('voucher_id').notNullable().unsigned().references('voucher_id').inTable('vouchers')
            table.string('voucher_code').notNullable().unique()
            table.enu('used',['0','1']).notNullable().defaultTo('0')
            table.datetime('expire_date')
            table.timestamps()
            table.datetime('deleted_at')
        })
    }

    down() {
        this.drop('member_vouchers')
    }
}

module.exports = MemberVoucherSchema
