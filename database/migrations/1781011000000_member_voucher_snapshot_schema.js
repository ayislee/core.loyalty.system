'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')
const Database = use('Database')

class MemberVoucherSnapshotSchema extends Schema {
    async up() {
        await Database.raw(`
            ALTER TABLE member_vouchers
            ADD COLUMN voucher_type ENUM('free', 'amount') NULL AFTER voucher_id,
            ADD COLUMN discount_calculation_type ENUM('fixed_amount', 'percentage') NULL AFTER voucher_type,
            ADD COLUMN discount_value DECIMAL(12, 2) UNSIGNED NULL AFTER discount_calculation_type,
            ADD COLUMN redeemed_point DECIMAL(12, 2) UNSIGNED NULL AFTER discount_value
        `)

        await Database.raw(`
            UPDATE member_vouchers mv
            JOIN vouchers v ON v.voucher_id = mv.voucher_id
            SET
                mv.voucher_type = v.type,
                mv.discount_calculation_type = CASE WHEN v.type = 'amount' THEN v.discount_calculation_type ELSE NULL END,
                mv.discount_value = CASE WHEN v.type = 'amount' THEN v.discount_value ELSE NULL END,
                mv.redeemed_point = v.number_point
            WHERE mv.voucher_type IS NULL OR mv.redeemed_point IS NULL
        `)
    }

    async down() {
        await Database.raw(`
            ALTER TABLE member_vouchers
            DROP COLUMN redeemed_point,
            DROP COLUMN discount_value,
            DROP COLUMN discount_calculation_type,
            DROP COLUMN voucher_type
        `)
    }
}

module.exports = MemberVoucherSnapshotSchema
