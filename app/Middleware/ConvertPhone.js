'use strict'
class ConvertPhone {
    async handle ({ request,response,auth }, next) {
        // call next to advance the request
        if(request.all().phone[0] === '0'){
            request.all().phone = request.all().phone.replace(/^0/, "62");
        }else if(request.all().phone[0] === '+'){
            request.all().phone = request.all().phone.replace("+", "");
        }
        
        await next()
    }
}

module.exports = ConvertPhone