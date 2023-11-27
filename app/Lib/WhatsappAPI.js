'use strict'
const Env = use('Env')
const axios = use('axios')
module.exports = {
    async send(data) {
        // convert 0 to 62
        console.log('data',data)
        // if(data.phone.match(/^(\+62|62)?[\s-]?0?8[1-9]{1}\d{1}[\s-]?\d{4}[\s-]?\d{2,5}$/)){

        // }
        const API_URL = Env.get('WHATSAPP_API_URL')
        const response = await axios({
            method: 'post',
            url: API_URL,
            data: {
                api_key: Env.get('WHATSAPP_API_KEY'),
                to: data.phone,
                message: data.message,
            }
        });
        console.log(response)
    },

}