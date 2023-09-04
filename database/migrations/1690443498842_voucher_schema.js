'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class VoucherSchema extends Schema {
    up() {
        this.create('vouchers', (table) => {
            table.increments('voucher_id')
            table.string('name')
            table.integer('partner_id').notNullable().unsigned().references('partner_id').inTable('partners')
            table.string('sku').notNullable()
            table.string('product_image').notNullable()
            table.decimal('number_point',12,2).unsigned().notNullable()
            table.enu('status',['active', 'not active']).defaultTo('not active').notNullable()
            table.text('description')
            table.integer('duration').notNullable().defaultTo(7).unsigned()
            table.integer('created_by').notNullable().unsigned().references('user_id').inTable('users')
            table.integer('updated_by').notNullable().unsigned().references('user_id').inTable('users')
            table.timestamps()
            table.datetime('deleted_at')
        })
    }

    down() {
        this.drop('vouchers')
    }
}

module.exports = VoucherSchema
