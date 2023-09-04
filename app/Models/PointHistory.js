'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const TablePoint = use('App/Models/Point')

class Pointhistory extends Model {
    static get table() {
		return "point_histories";
	}

	static get primaryKey() {
		return "point_history_id";
	}

    static boot () {
        super.boot()

        /**
        * A hook to hash the user password before saving
        * it to the database.
        */
        this.addTrait('Filter')
		this.addTrait('OrderBy')
        
        this.addTrait('@provider:Lucid/SoftDeletes')
        this.addHook('afterSave', async (table) => {
            let data    
            data = await TablePoint.query().where('member_id',table.member_id).first()
            if(!data){
                data = new TablePoint()
                data.member_id = table.member_id
                data.point = table.point
                
            }else{
                data.point = data.point + table.point
                
            }
            await data.save()
        })
        
    }

    member() {
        return this.belongsTo('App/Models/Member','member_id','member_id')
    }
}

module.exports = Pointhistory
