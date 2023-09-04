'use strict'
const Customer = use('App/Models/Customer')
const axios = use('axios')
const email = use('App/Lib/BasicEmailService')

async function GetToken(id){
    let methode
    let data
    let msisdn
    let loginID
    let token = Math.floor(Math.random() * 1000000);

    let now = new Date()
    now.setSeconds(now.getSeconds() + 3600 )


    if (id.match(/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/)) {
        methode = 'email';
        console.log('this email address')
    }else if(id.match(/^(\+62|62)?[\s-]?0?8[1-9]{1}\d{1}[\s-]?\d{4}[\s-]?\d{2,5}$/)){
        methode = 'msisdn'
    }else {
        return {
            status: false,
            message: "invalid phone number"
        }
    }


    switch (methode) {
        case 'email':
            data = await Customer.query().where('email',id).first()
            if(!data){
                data = new Customer()
                data.email = id
            }

            data.lid = id
            data.token = token.toString()
            data.token_valid_until = now
            await data.save()
            const email_message =  'Token for login is '+data.token+', only valid in 1 hour'

            // send mail

            const option = {
                referrer_from: 'admin',
                recipient_email: data.email,
                recipient_name: data.firstname,
                token: data.token,

            }

            const sendEmail = await email.registerCustomer(option)


            return {
                status: true,
                message: `Token already sent to ${id} valid until ${now}`,
                methode: "email",
                receiver: id,
                token: token

            }
            break;
        case 'msisdn':
            if(id.substring(0,1)=='0') {
                msisdn = id
                loginID = '62'+id.substring(1,id.length)



            }else if(id.substring(0,2)=='62'){
                msisdn = '0'+id.substring(2,id.length)
                loginID = id
            }else {
                msisdn = '0'+id.substring(3,id.length)
                loginID= id.substring(1,id.length)
            }

            

            // return loginID
            // return msisdn

            data = await Customer.query().where('msisdn',msisdn).first()


            if(!data){
                data = new Customer()
                data.msisdn = msisdn
            }

            data.lid = msisdn
            data.token = token.toString()
            data.token_valid_until = now
            await data.save()
            const sms_message =  'Le Fournil. Kode OTP Anda adalah '+token+', Jangan berikan kode ini ke siapapun'
            axios.post(process.env.MSG_API_URL, {
                api_server_key: process.env.MSG_API_SERVER_KEY,
                api_client_key: process.env.MSG_API_SERVER_CLIENT,
                api_media: "sms",
                api_channel: "broadcast",
                api_sender_name: "MEDIACARTZ",
                api_recipient_address: loginID,
                api_message: sms_message,
            })
            .then(function (response) {
                console.log(response);
            })
            .catch(function (error) {
                console.log(error);
            });

            // send mail

            const opt = {
                referrer_from: 'admin',
                recipient_email: data.email,
                recipient_name: data.firstname,
                token: data.token,

            }

            await email.registerCustomer(opt)


            return {
                status: true,
                message: `${process.env.APP_NAME} - Token already sent to ${msisdn} valid until ${now}`,
                receiver : msisdn,
                methode: "sms",
                // token: token

            }

            break;

        default:
            break;
    }

    // const data = Customer.query()
    //     .where('email',id)
    // return token
}

module.exports = GetToken
