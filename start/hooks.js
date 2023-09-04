const { hooks } = require('@adonisjs/ignitor')
const moment = use('moment')

hooks.after.providersBooted(() => {
    const Validator = use('Validator')
    const Database = use('Database')
    const View = use('View')

    View.global('moment', (data) => moment(data))
    View.global('currency',(data)=>(data).toLocaleString('id-ID', { style: 'currency', currency: 'IDR',minimumFractionDigits: 0 }))


    const existsFn = async (data, field, message, args, get) => {
        const value = get(data, field)
        if (!value) {

            return
        }

        const [table, column] = args
        const row = await Database.table(table).where(column, value).first()

        if (!row) {
            throw message
        }
    }

    Validator.extend('exists', existsFn)

    

    const betweenFn = async(data, field, message, args, get) => {

		let value = get(data, field)
		if(args.length != 2){
			throw message
		}

		value = parseInt(value)
		if(isNaN(value)){
			throw message
		}

		let min = Math.min(args[0],args[1])
		let max = Math.max(args[0],args[1])

		console.log("Minimum--"+min)
		console.log("Minimum--"+max)

		if(value < min || value > max){
			throw message
		}

	}
	Validator.extend('between', betweenFn)


    const msisdnFn = async(data, field, message, args, get) =>{
        console.log('validator data',data)
        console.log('validator field',field)
        console.log('validator args',args)

        let value = get(data, field)
        console.log('validator value',value)
        if (!value) {
            return
        }

        if(!value.match(/^(\+62|62)?[\s-]?0?8[1-9]{1}\d{1}[\s-]?\d{4}[\s-]?\d{2,5}$/)){
            throw message
        }
    }
    Validator.extend('msisdn', msisdnFn)


})
