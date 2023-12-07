'use strict'
const UserPartner = use('App/Models/UserPartner')
module.exports = {
    async getPartnerIDFromUser(userID) {
        try {
            console.log('user',userID) 
            const up = await UserPartner.query().where('user_id',userID).first()   
            console.log(up) 
            if(up) {
                return up.partner_id
            }else{
                return false    
            }
        } catch (error) {
            console.log(error)
            return false
        }
        

    },

}