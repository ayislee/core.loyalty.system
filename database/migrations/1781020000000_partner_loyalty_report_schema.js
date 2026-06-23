'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class PartnerLoyaltyReportSchema extends Schema {
    up() {
        this.table('point_histories', (table) => {
            table.string('source_type', 50).notNullable().defaultTo('legacy')
            table.index(
                ['partner_id', 'source_type', 'created_at'],
                'point_histories_partner_source_created_index'
            )
        })

        this.table('member_vouchers', (table) => {
            table.integer('partner_id').unsigned().nullable()
            table.string('voucher_name_snapshot', 255).nullable()
            table.index(
                ['partner_id', 'created_at'],
                'member_vouchers_partner_created_index'
            )
        })

        this.raw(`
            UPDATE point_histories
            SET source_type = CASE
                WHEN \`desc\` LIKE 'Release hold redeem %' THEN 'voucher_release'
                WHEN \`desc\` LIKE 'Hold redeem %' THEN 'voucher_hold'
                WHEN \`desc\` LIKE 'Redeem %' AND point < 0 THEN 'voucher_redeem_legacy'
                WHEN partner_id IS NOT NULL AND point > 0 THEN 'partner_award'
                WHEN partner_id IS NOT NULL AND point <= 0 THEN 'partner_adjustment'
                ELSE 'legacy'
            END
        `)

        this.raw(`
            UPDATE member_vouchers mv
            INNER JOIN vouchers v ON v.voucher_id = mv.voucher_id
            SET
                mv.partner_id = v.partner_id,
                mv.voucher_name_snapshot = v.name
            WHERE mv.partner_id IS NULL OR mv.voucher_name_snapshot IS NULL
        `)
    }

    down() {
        this.table('member_vouchers', (table) => {
            table.dropIndex(
                ['partner_id', 'created_at'],
                'member_vouchers_partner_created_index'
            )
            table.dropColumn('voucher_name_snapshot')
            table.dropColumn('partner_id')
        })

        this.table('point_histories', (table) => {
            table.dropIndex(
                ['partner_id', 'source_type', 'created_at'],
                'point_histories_partner_source_created_index'
            )
            table.dropColumn('source_type')
        })
    }
}

module.exports = PartnerLoyaltyReportSchema
