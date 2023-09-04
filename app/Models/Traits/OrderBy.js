'use strict'

class OrderBy {
	register (Model, options) {

		Model.queryMacro('order',function(array){

			if(array!==undefined){
				for (let iterator of array) {
					if(iterator.field && iterator.sort){
						this.orderBy(iterator.field,iterator.sort)
					}
				}

			}
			return this
		})
	}
}

module.exports = OrderBy
