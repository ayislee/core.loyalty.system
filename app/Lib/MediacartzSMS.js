'use strict'
const Env = use('Env')
const axios = use('axios')
module.exports = {
    async send(data) {
        // convert 0 to 62
        if(data.phone.match(/^(\+62|62)?[\s-]?0?8[1-9]{1}\d{1}[\s-]?\d{4}[\s-]?\d{2,5}$/)){

        }
        // const API_URL = Env.get('SMS_MEDIACARTZ_URL')
        // const response = await axios({
        //     method: 'post',
        //     url: API_URL,
        //     data: {
        //         api_server_key: Env.get('SMS_MEDIACARTZ_SERVEY_KEY'),
        //         api_client_key: Env.get('SMS_MEDIACARTZ_CLIENT_KEY'),
        //         api_media: "sms",
        //         api_channel: "otp",
        //         api_sender_name: "OBI",
        //         api_sender_email: "",
        //         api_sender_reply_to: "",
        //         api_recipient_name: "",
        //         api_recipient_address: data.phone,
        //         api_subject: "",
        //         api_message: data.api_message,
        //         api_return_url: ""

        //     }
        // });
        console.log(response)
    },

}