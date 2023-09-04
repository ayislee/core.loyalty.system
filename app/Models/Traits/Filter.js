'use strict'

class Filter {
	register (Model, options) {
		Model.queryMacro('filter',function(array,tableName){

			if(tableName===undefined){
				tableName = this._single.table
			}
			let obj
			let f
            let mode
			if(array !== undefined){

				for (let iterator of array) {
					// console.log(iterator.field!==undefined)
					// console.log(iterator.value!==undefined)
                    mode = iterator.mode === "raw" ? mode=iterator.mode:mode="raw"
					if((iterator.field) && (iterator.value) && (iterator.operator)){
						obj = iterator.field.split('.')
						if(obj.length > 1){
							f = iterator.field
						}else{
							f = tableName+'.'+ iterator.field
						}
                        if(mode === "raw"){
                            this.whereRaw(`${iterator.field} ${iterator.operator} "${iterator.value}"`)
                        }else{
                            this.where(`${f}`,iterator.operator,iterator.value)
                        }

					}
				}

			}
			return this
		})

		Model.queryMacro('paginates',function(page,row){
			console.log('sql nya ini')
			console.log(this.toSQL().sql)
			const query = this.toSQL().sql
			let q = query.split('from')
			let s = q[0]
			let afterFrom
			if(q.length > 2){

			}

			let distinct = q[0].split('distinct')
			console.log(distinct)
			// if(distinct.length == 2 )

			return this.fetch()
		})
	}
}

module.exports = Filter
