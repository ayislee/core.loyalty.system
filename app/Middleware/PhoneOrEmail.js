'use strict'
class ConvertPhone {
    async handle ({ request,response,auth }, next) {
        // call next to advance the request
        if(request.all().lid){
            if(!request.all().lid.match(/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}/)){
                if(!request.all().lid.match(/^(\+62|62)?[\s-]?0?8[1-9]{1}\d{1}[\s-]?\d{4}[\s-]?\d{2,5}$/)){
                    return response.json({
                        status: false,
                        message: 'Invalid mail LID'
                    })
                }
                request.all().phone = request.all().lid
                request.all().email = null
                request.all().lid_type = 'phone'
                
            }else{
                request.all().email = request.all().lid
                request.all().phone = null
                request.all().lid_type = 'email'
            }
    
            if(request.all().phone){
                if(request.all().phone[0] === '0'){
                    request.all().phone = request.all().phone.replace(/^0/, "62");
                }else if(request.all().phone[0] === '+'){
                    request.all().phone = request.all().phone.replace("+", "");
                }
                request.all().lid = request.all().phone
            }
        }

        if(request.all().phone){
            if(request.all().phone[0] === '0'){
                request.all().phone = request.all().phone.replace(/^0/, "62");
            }else if(request.all().phone[0] === '+'){
                request.all().phone = request.all().phone.replace("+", "");
            }
            request.all().lid = request.all().phone
            request.all().email = null
            request.all().lid_type = 'phone'
        }
        
        
        
        await next()
    }
}

module.exports = ConvertPhone