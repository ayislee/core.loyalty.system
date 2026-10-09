'use strict'

const Schema = use('Schema')

class AddVoucherCategoryToMemberVouchersSchema extends Schema {
    up () {
        this.table('member_vouchers', (table) => {
            table.enu('voucher_category', ['offline', 'marketplace']).nullable().index()
        })
    }

    down () {
        this.table('member_vouchers', (table) => {
            table.dropColumn('voucher_category')
        })
    }
}

module.exports = AddVoucherCategoryToMemberVouchersSchema
