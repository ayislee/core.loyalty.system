'use strict'

const Schema = use('Schema')
const Database = use('Database')

class AddGuestVisitorToMemberActivityHistoriesSchema extends Schema {
    async up() {
        await Database.raw('ALTER TABLE member_activity_histories ADD COLUMN visitor_id VARCHAR(100) NULL AFTER member_id')
        await Database.raw('ALTER TABLE member_activity_histories ADD INDEX member_activity_histories_visitor_id_index (visitor_id)')

        try {
            await Database.raw('ALTER TABLE member_activity_histories DROP FOREIGN KEY member_activity_histories_member_id_foreign')
        } catch (error) {
            // The constraint name can differ on existing databases.
        }

        await Database.raw('ALTER TABLE member_activity_histories MODIFY member_id INT UNSIGNED NULL')

        try {
            await Database.raw('ALTER TABLE member_activity_histories ADD CONSTRAINT member_activity_histories_member_id_foreign FOREIGN KEY (member_id) REFERENCES members(member_id)')
        } catch (error) {
            // Keep migration usable when the FK already exists under a different name.
        }
    }

    async down() {
        try {
            await Database.raw('ALTER TABLE member_activity_histories DROP FOREIGN KEY member_activity_histories_member_id_foreign')
        } catch (error) {
            // Ignore missing default FK name.
        }

        try {
            await Database.raw('ALTER TABLE member_activity_histories DROP INDEX member_activity_histories_visitor_id_index')
        } catch (error) {
            // Ignore missing index.
        }

        await Database.raw('ALTER TABLE member_activity_histories DROP COLUMN visitor_id')
        await Database.raw('ALTER TABLE member_activity_histories MODIFY member_id INT UNSIGNED NOT NULL')

        try {
            await Database.raw('ALTER TABLE member_activity_histories ADD CONSTRAINT member_activity_histories_member_id_foreign FOREIGN KEY (member_id) REFERENCES members(member_id)')
        } catch (error) {
            // Keep rollback tolerant.
        }
    }
}

module.exports = AddGuestVisitorToMemberActivityHistoriesSchema
