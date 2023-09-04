'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */
const SendMail = use('App/Lib/BasicEmailService.js')
const View = use("View");
const Env = use('Env')

class SendMessage {
    /**
    * @param {object} ctx
    * @param {Request} ctx.request
    * @param {Function} next
    */
    async handle ({ request }, next) {
        // call next to advance the request

        await next()
        
        await Lib.SendMail({
            to: request.all().email,
            from: Env.get('NOREPLY_FULLADDRESS'),
            cc: "",
            bcc: "",
            subject: "",
            contentHTML:""
        })
    }
}

module.exports = SendMessage
