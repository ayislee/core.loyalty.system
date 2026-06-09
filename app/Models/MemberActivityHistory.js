'use strict'

const Model = use('Model')

class MemberActivityHistory extends Model {
    static get table() {
        return 'member_activity_histories'
    }

    static get primaryKey() {
        return 'member_activity_history_id'
    }

    static boot() {
        super.boot()

        this.addTrait('Filter')
        this.addTrait('OrderBy')
        this.addTrait('@provider:Lucid/SoftDeletes')
    }

    getMetadata(metadata) {
        if (!metadata) return null

        try {
            return JSON.parse(metadata)
        } catch (error) {
            return null
        }
    }

    member() {
        return this.belongsTo('App/Models/Member', 'member_id', 'member_id')
    }
}

module.exports = MemberActivityHistory
