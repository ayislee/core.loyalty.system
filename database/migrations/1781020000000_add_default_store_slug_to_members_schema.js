'use strict'

const Schema = use('Schema')

class AddDefaultStoreSlugToMembersSchema extends Schema {
    up () {
        this.table('members', (table) => {
            table.string('default_store_slug', 255).nullable().index()
        })
    }

    down () {
        this.table('members', (table) => {
            table.dropColumn('default_store_slug')
        })
    }
}

module.exports = AddDefaultStoreSlugToMembersSchema
