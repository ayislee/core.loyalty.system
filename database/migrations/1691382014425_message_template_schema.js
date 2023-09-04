'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class MessageTemplateSchema extends Schema {
    up() {
        this.create('message_templates', (table) => {
            table.increments('message_template_id')
            table.string('name')
            table.integer('partner_id').unsigned().notNullable().references('partner_id').inTable('partners')
            table.text('template')
            table.enu('status',['active','not active'])
            table.timestamps()
            table.datetime('deleted_at')
        })
    }

    down() {
        this.drop('message_templates')
    }
}

module.exports = MessageTemplateSchema
