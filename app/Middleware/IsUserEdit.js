'use strict'
const UserPartner = use('App/Models/UserPartner')

class IsUserEdit {
    async handle({ request, response, auth }, next) {
        // call next to advance the request
        if(auth.user.type !== 'admin'){
            // partner
            if(auth.user.is_owner === 'yes'){
                // owner user
                const userPartner = await UserPartner.query()
                .where('user_id',auth.user.user_id)
                .first()
                if(userPartner){
                    // check apakah yang diedit satu partner
                    const up = await UserPartner.query()
                    .where('user_id',request.all().user_id)
                    .first()

                    if(up){
                        if(userPartner.partner_id !== up.partner_id){
                            return response.json({
                                status: false,
                                message: 'You cant edit this account'
                            })    
                        }

                    }else{
                        return response.json({
                            status: false,
                            message: 'You cant edit this account'
                        })
                    }

                }else{
                    // hanya bisa edit diri sendiri
                    if(request.all().user_id !== auth.user.user_id){
                        return response.json({
                            status: false,
                            message: 'You cant edit other account'
                        })
                    }
                }

            }else{
                // normal user
                if(request.all().user_id !== auth.user.user_id){
                    return response.json({
                        status: false,
                        message: 'You cant edit other account'
                    })
                }
            }

        }

        

        await next()
    }
}

module.exports = IsUserEdit
