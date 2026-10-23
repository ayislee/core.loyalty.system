'use strict'

const Schema = use('Schema')

class AddFinanceUserType extends Schema {
    up () {
        this.raw("ALTER TABLE users MODIFY `type` ENUM('partner','admin','finance') NULL DEFAULT 'partner'")
    }

    down () {
        this.raw("ALTER TABLE users MODIFY `type` ENUM('partner','admin') NULL DEFAULT 'partner'")
    }
}

module.exports = AddFinanceUserType
