'use strict'

const Schema = use('Schema')

class AddCategoryToVouchersSchema extends Schema {
    up () {
        this.table('vouchers', (table) => {
            table.enu('category', ['offline', 'marketplace']).nullable().index()
        })
    }

    down () {
        this.table('vouchers', (table) => {
            table.dropColumn('category')
        })
    }
}

module.exports = AddCategoryToVouchersSchema
