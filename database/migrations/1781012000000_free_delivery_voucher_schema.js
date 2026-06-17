'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')
const Database = use('Database')

class FreeDeliveryVoucherSchema extends Schema {
    async up() {
        await Database.raw("ALTER TABLE vouchers MODIFY COLUMN type ENUM('free', 'amount', 'free_delivery') DEFAULT 'free'")
        await Database.raw("ALTER TABLE vouchers MODIFY COLUMN sku VARCHAR(255) NULL")
        await Database.raw("ALTER TABLE member_vouchers MODIFY COLUMN voucher_type ENUM('free', 'amount', 'free_delivery') NULL")
    }

    async down() {
        await Database.raw("UPDATE vouchers SET type = 'free' WHERE type = 'free_delivery'")
        await Database.raw("UPDATE member_vouchers SET voucher_type = 'free' WHERE voucher_type = 'free_delivery'")
        await Database.raw("ALTER TABLE member_vouchers MODIFY COLUMN voucher_type ENUM('free', 'amount') NULL")
        await Database.raw("ALTER TABLE vouchers MODIFY COLUMN type ENUM('free', 'amount') DEFAULT 'free'")
        await Database.raw("UPDATE vouchers SET sku = '' WHERE sku IS NULL")
        await Database.raw("ALTER TABLE vouchers MODIFY COLUMN sku VARCHAR(255) NOT NULL")
    }
}

module.exports = FreeDeliveryVoucherSchema
