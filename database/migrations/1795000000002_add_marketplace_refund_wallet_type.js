'use strict'

const Schema = use('Schema')
const Database = use('Database')

class AddMarketplaceRefundWalletType extends Schema {
    async up () {
        await Database.raw("ALTER TABLE wallet_ledger_entries MODIFY type ENUM('refund', 'marketplace_payment', 'marketplace_refund', 'withdrawal', 'adjustment', 'reversal') NOT NULL")
    }

    async down () {
        await Database.raw("ALTER TABLE wallet_ledger_entries MODIFY type ENUM('refund', 'marketplace_payment', 'withdrawal', 'adjustment', 'reversal') NOT NULL")
    }
}

module.exports = AddMarketplaceRefundWalletType
