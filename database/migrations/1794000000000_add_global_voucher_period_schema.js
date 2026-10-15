'use strict'

const Schema = use('Schema')
const Database = use('Database')

class AddGlobalVoucherPeriodSchema extends Schema {
  async up () {
    await Database.raw("ALTER TABLE vouchers MODIFY category ENUM('offline','marketplace','global') NULL")
    this.table('vouchers', (table) => {
      table.datetime('global_start_date').nullable().index()
      table.datetime('global_end_date').nullable().index()
    })
  }

  async down () {
    await Database.raw("UPDATE vouchers SET category = NULL WHERE category = 'global'")
    this.table('vouchers', (table) => {
      table.dropColumn('global_start_date')
      table.dropColumn('global_end_date')
    })
    await Database.raw("ALTER TABLE vouchers MODIFY category ENUM('offline','marketplace') NULL")
  }
}

module.exports = AddGlobalVoucherPeriodSchema
