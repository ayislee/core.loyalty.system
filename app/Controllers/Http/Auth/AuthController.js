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

    async getDefaultPartner(request) {
        const req = request.all()

        if (req.partner_id) {
            const partner = await Partner.query().where('partner_id', req.partner_id).first()
            if (partner) return partner
        }

        if (req.company_slug) {
            const partner = await Partner.query().where('company_slug', req.company_slug).first()
            if (partner) return partner
        }

        const defaultCompanySlug = Env.get('DEFAULT_COMPANY_SLUG')
        if (defaultCompanySlug) {
            const partner = await Partner.query().where('company_slug', defaultCompanySlug).first()
            if (partner) return partner
        }

        return Partner.query().first()
    }

    async getMemberPartner(member) {
        if (member.default_partner_id) {
            const partner = await Partner.query().where('partner_id', member.default_partner_id).first()
            if (partner) return partner
        }

        const memberPartner = await MemberPartner.query()
            .where('member_id', member.member_id)
            .first()

        if (memberPartner) {
            return Partner.query().where('partner_id', memberPartner.partner_id).first()
        }

        return null
    }

    async ensureMemberPartner(member, partner) {
        if (!partner) return null

        if (member.default_partner_id != partner.partner_id) {
            member.default_partner_id = partner.partner_id
            await member.save()
        }

        let memberPartner = await MemberPartner.query()
            .where('member_id', member.member_id)
            .where('partner_id', partner.partner_id)
            .first()

        if (!memberPartner) {
            memberPartner = new MemberPartner()
            memberPartner.member_id = member.member_id
            memberPartner.partner_id = partner.partner_id
            await memberPartner.save()
        }

        return memberPartner
    }


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
        try {
            let token = Math.floor(Math.random() * (999999 - 100000 + 1)) + 100000;
            const req = request.all()
            const m = Member.query()
            let isNewMember = false

            if(req.lid_type == 'phone'){
                m.where('phone', req.phone)
            }else{
                m.where('email', req.email)
            }
            
            let member = await m.first()
            const hasPartnerContext = req.partner_id || req.company_slug
            let partner = hasPartnerContext ? await this.getDefaultPartner(request) : null

            if (member && !partner) {
                partner = await this.getMemberPartner(member)
            }

            if (!partner) {
                partner = await this.getDefaultPartner(request)
            }

            if (!partner) {
                return response.json({
                    status: false,
                    message: 'Default partner is not configured'
                })
            }

            if(!member){
                member = new Member()
                member.phone = req.lid_type == 'phone' ? req.phone : null
                member.email = req.lid_type == 'email' ? req.email : null
                member.lid = req.lid_type == 'phone' ? req.phone : req.email
                member.status = 'not active'
                member.default_partner_id = partner.partner_id
                await member.save()
                isNewMember = true
            }

            await this.ensureMemberPartner(member, partner)

            token = token.toString()
            member.token = token
            await member.save()

            Event.fire('token::member', {
                member: member.toJSON(),
                lid_type: req.lid_type,
                token: token.toString()
            })

            return response.json({
                status: true,
                message: `Token already send valid in ${Env.get('TOKEN_VALIDITY_PERIODE')} minute(s)`,
                registered: !isNewMember,
                is_new_member: isNewMember
            })
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: 'Something wrong'
            })
        }
    }

    async login_token({request, response, auth}) {
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

                // Update member status to active
                data.status = 'active'
                await data.save()

                const jdata = data.toJSON()
                let partnerId = jdata.default_partner_id !== null && jdata.default_partner_id !== undefined
                    ? jdata.default_partner_id
                    : jdata?.member_partners?.[0]?.partner_id
                let partner = partnerId
                    ? await Partner.query().where('partner_id', partnerId).first()
                    : null

                if (!partner && jdata?.member_partners?.[0]?.partner_id) {
                    partnerId = jdata.member_partners[0].partner_id
                    partner = await Partner.query().where('partner_id', partnerId).first()
                }

                if (!partner) {
                    return response.json({
                        status: false,
                        message: 'invalid partner'
                    })
                }

                if (data.default_partner_id != partner.partner_id) {
                    data.default_partner_id = partner.partner_id
                    await data.save()
                }

                const token = await auth.authenticator(request.all().lid_type).generate(data)
                return response.json({
                    status: true,
                    message: 'success',
                    data: {...token,
                        user:data,
                        partner_id: partnerId,
                        partner: {
                            primary_color: partner.primary_color,
                            primary_color_hover: partner.primary_color_hover || partner.primary_color
                        }
                    }
                })
            }
        } catch (error) {
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
