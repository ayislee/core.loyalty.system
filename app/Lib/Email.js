'use strict'
const Env = use('Env')
const axios = use('axios')
const BasicEmailService = use('App/Lib/BasicEmailService')
const View = use('View')
module.exports = {
    async send(data) {
        console.log('data',data)

        let info = {
            from: Env.get('EMAIL_SENDER'), // sender address
            to: data.email, // list of receivers
            bcc: null,
            cc: null,
            subject: data.subject, // Subject line
            contentHTML: View.render('mail/token',{
                message: data.message
            })
        };

        await BasicEmailService.SendMail(info)
    }

}