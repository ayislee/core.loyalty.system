'use strict'
const User = use('App/Models/User')
const Utility = use("Utility");
// const PointLib = use('App/Lib/PointLib')
const uuid = use('uuid')
const Member = use('App/Models/Member')
const Event = use('Event')
const Env = use('Env')
const moment = use('moment')
const MemberPartner = use('App/Models/MemberPartner')
const Partner = use('App/Models/Partner')
class AuthController {


	async user_register({request, response}) {
        try {
            // console.log("register")
            const user = new User()
            user.firstname = request.all()?.firstname
            user.lastname = request.all()?.lastname
            user.email = request.all().email
            user.password = request.all().password  
            user.type = request.all().type
            user.phone = request.all().phone
            user.status = 'active'
            await user.save()
            return response.json({
                status: true,
                message: 'User created'
            })

        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: 'Something wrong'
            })
        }
	}

    async user_login({request, response, auth}){
        try {
            const data = await auth.attempt(request.all().email, request.all().password)

            let user = await User.query().where('email',request.all().email).first()
            data.user = user
            if(user.status === 'not active'){
                // return 0
                return response.status(400).json({
                     status: false,
                     message: "user not active"
                 })
            }else{
                // return 1
                
                return response.json({
                    status: true,
                    data: data
                }

                )
            }

        } catch (error) {
			console.log(error)
            return response.status(400).json({
                status: false,
                message: "invalid email or password"
            })
        }
    }
	
	async auth({auth, request, response}){
        try {
            const data = await auth.attempt(request.all().email, request.all().password)

            let user = await User.query().where('email',request.all().email).first()
            data.user = user
            if(user.status === '0'){
                // return 0
                return response.status(400).json({
                     status: false,
                     message: "user not active"
                 })
            }else{
                // return 1
                
                return response.json({
                    status: true,
                    data: data
                })
            }

        } catch (error) {
			console.log(error)
            return response.status(400).json({
                status: false,
                message: "invalid email or password"
            })
        }

    }


    async request_token({request, response}) {
        // return request.all()
        let token = Math.floor(Math.random() * (999999 - 100000 + 1)) + 100000;
        // return response.json(request.all())

        const m = Member.query()
        if(request.all().lid_type == 'phone'){
            m.where('phone',request.all().phone)
        }else{
            m.where('email',request.all().email)
        }
        
        const member = await m.first()
        // return member
        token = token.toString()
        // return token
        if(!member){
            return response.json({
                status: false,
                message: 'You not registered'
            })
        }

        member.token = token
        await member.save()
        Event.fire('token::member', {
            member: member.toJSON(),
            lid_type: request.all().lid_type,
            token:token.toString()
        })
        return response.json({
            status: true,
            message: `Token already send valid in ${Env.get('TOKEN_VALIDITY_PERIODE')} minute(s)`
        })
    }

    async login_token({request, response, auth}) {
        // return request.all()
        try {
            console.log('phone',request.all().phone)
            await auth.authenticator(request.all().lid_type).attempt(request.all().lid, request.all().token)

            if(await auth.authenticator(request.all().lid_type).attempt(request.all().lid, request.all().token)){
                console.log("test")
                const now = moment().format('YYYY-MM-DD HH:mm:ss')
                
                const data = await Member.query()
                .where(request.all().lid_type,request.all().lid)
                .where('token_valid_until','>',now)
                .with('member_partners',(build)=>{
                })
                .first()

                if(!data){
                    return response.json({
                        status: false,
                        message: 'token expired'
                    })        
                }

                const partner = await Partner.query().where('partner_id',data.default_partner_id).first()

                const jdata = data.toJSON()
                // return response.json(jdata)

                const token = await auth.authenticator(request.all().lid_type).generate(data)
                return response.json({
                    status: true,
                    message: 'success',
                    data: {...token,
                        user:data,
                        partner_id:jdata.default_partner_id !== null ? jdata.default_partner_id : jdata?.member_partners[0]?.partner_id,
                        partner: {
                            primary_color: partner.primary_color,
                            primary_color_hover: partner.primary_color_hover
                        }
                    }
                })
            }
        } catch (error) {
            // console.log('terjadi error')
            // console.log(error)
            return response.json({
                status: false,
                message: 'invalid token'
            })
        }
        
    }



    //==============================================================================
	//	Google SSO
	//	Frontend : https://developers.google.com/identity/sign-in/web/sign-in
	//	Backend : https://developers.google.com/identity/sign-in/web/backend-auth
	//==============================================================================

	async postLoginViaGoogle({ auth, request, response }) {
        // return response.json(request.sso_payload)
        try {
			let user, token,point;

            // cek apakah sso_payload sudah teregister ?
            user = await User.query().where('email',request.sso_payload.email).first()
            if(user) {
                // loginkan
                // update base profile with google account
                user.firstname = request.sso_payload.given_name
                user.lastname = request.sso_payload.family_name
                user.image_profile = request.sso_payload.picture
                await user.save()
                token = await auth.generate(user);


            } else {
                // daftarkan user
                const usr = new User();
                usr.email = request.sso_payload.email
                usr.firstname = request.sso_payload.given_name
                usr.lastname = request.sso_payload.family_name
                usr.image_profile = request.sso_payload.picture
                usr.type = 'member'
                usr.status = 'active'
                await usr.save();
                token = await auth.generate(usr);
				user = usr;

                
            }
            // 
            // const reg = await PointLib.registration(user)
			//proses info tambahan
                      
            return response.json({
                status: true,
                data: {
                    token: token,
                    user: user
                }
            })
			
		} catch (error) {
            console.log(error)
			Utility.catchError(request, response, error);
		}
	}

}

module.exports = AuthController
