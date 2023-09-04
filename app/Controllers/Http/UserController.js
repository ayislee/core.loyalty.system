'use strict'
const User = use('App/Models/User')
const UserPartner =  use('App/Models/UserPartner')
const Database = use('Database')
class UserController {
    async gets({request, response, auth}) {
        let users, partner_id
        if(auth.user.type === 'admin') {
            users = await User.query()
            .select('users.user_id')
            .with('UserPartner',(build)=>{
                build.with('partner')
            })
            .filter(request.all().filter)
            .order(request.all().order)
            .paginate(request.all().page, request.all().rows)

        }else{
            if(auth.user.is_owner === 'yes'){
                const up = await UserPartner.query().where('user_id',auth.user.user_id).first()
                if(up){
                    partner_id = up.partner_id
                    const listUser = await UserPartner.query().select('user_id').where('partner_id',partner_id).fetch()
                    const list_user = listUser.toJSON()
                    let usr = []
                    for (const i of list_user) {
                        usr.push(i.user_id)
                    }
                    users = await User.query()
                    

                    .with('UserPartner',(build)=>{
                        build.with('partner')
                    })
                    .whereIn('user_id',usr)
                    .filter(request.all().filter)
                    .order(request.all().order)
                    .paginate(request.all().page, request.all().rows)
                }else{
                    
                    users = await User.query()
                    .select('users.*')
                    .with('UserPartner',(build)=>{
                        build.with('partner')
                    })
                    .where('user_id',auth.user.user_id)
                    .filter(request.all().filter)
                    .order(request.all().order)
                    .paginate(request.all().page, request.all().rows)
                }

                
            }else{
                users = await User.query()
                .with('UserPartner',(build)=>{
                    build.with('partner')
                })
                .select('users.*')
                .where('user_id',auth.user.user_id)
                .filter(request.all().filter)
                .order(request.all().order)
                .paginate(request.all().page, request.all().rows)
            }
        }
        return response.json({
            status: true,
            data: users
        })

    }
    
    async create({auth, request, response}) {
        let trx, user
        if(auth.user.type === 'admin'){
            user = new User()
            user.email = request.all().email
            user.firstname = request.all().firstname
            user.lastname = request.all().lastname
            user.phone = request.all().phone
            user.password = request.all().password
            
            await user.save()
            return response.json({
                status: true,
                message: 'success',
                data: user
            })

        } else {
            if(auth.user.is_owner === 'yes'){
                const userPartner = await UserPartner.query().where('user_id',auth.user.user_id).first()
                if(userPartner) {
                    const trx = await Database.beginTransaction()
                    try {
                        user = new User()
                        user.email = request.all().email
                        user.firstname = request.all().firstname
                        user.lastname = request.all().lastname
                        user.phone = request.all().phone
                        user.password = request.all().password
                        user.type = 'partner'
                        user.is_owner = 'no'
                        await user.save(trx)

                        const up = new UserPartner()
                        up.user_id = user.user_id
                        up.partner_id = userPartner.partner_id
                        await up.save(trx)
                        await trx.commit()

                        return response.json({
                            status: true,
                            message: 'success',
                            data: user
                        })
                    } catch (error) {
                        await trx.rollback()
                        console.log(error)
                        return response.json({
                            status: false,
                            message: 'something error'
                        })
                    }
                }else{
                    return response.json({
                        status: false,
                        message: 'Need create Partner first'
                    })
                }
            }else {
                return response.json({
                    status: false,
                    message: 'You not have authorize for this action'
                })
            }
        }
    }
    
    async edit({request, response, auth}) {
        const user = await User.query()
        .where('user_id',request.all().user_id)
        .first()

        user.email = request.all().email
        user.firstname = request.all().firstname
        user.lastname = request.all().lastname
        user.phone = request.all().phone
        if(auth.user.type === 'admin' || auth.user.is_owner === 'yes') {
            user.status = request.all().status ? request.all().status : user.status
        }
        
        await user.save()
        return response.json({
            status: true,
            message: 'success',
            data: user
        })

    }

    async create_user_partner({request, response, auth}) {
        let userPartner
        userPartner = await UserPartner.query().where('user_id',request.all().user_id).first()
        if(userPartner){
            userPartner.partner_id = request.all().partner_id
        }else{
            userPartner = new UserPartner()
            userPartner.user_id = request.all().user_id
            userPartner.partner_id = request.all().partner_id
        }

        await userPartner.save()
        return response.json({
            status: true,
            message: 'success',
            data: userPartner
        })
    }

}

module.exports = UserController
