'use strict'
const Member = use('App/Models/Member')
const Lib = use("App/Lib/LoyaltyLib")
const GetPoint = use('App/Models/GetPoint')
const Point = use('App/Models/Point')
const PointHistory = use('App/Models/PointHistory')
const Voucher = use('App/Models/Voucher')
const MemberVoucher = use('App/Models/MemberVoucher')
const VoucherExchange = use('App/Models/VoucherExchange')
const RedeemMerchant = use('App/Models/RedeemMerchant')
const Database = use('Database')
const Event = use('Event')
const Env = use('Env')
const Hash = use('Hash')
const Helpers = use('Helpers')
const moment = use('moment')
const CryptoJS = require("crypto-js");
const fs = require('fs')
const { parseEnv } = require("util")
const Partner = use('App/Models/Partner')
const MemberPartner = use('App/Models/MemberPartner')
const VoucherRedeemConfirmation = use('App/Lib/VoucherRedeemConfirmation')
const MemberContactVerification = use('App/Models/MemberContactVerification')
const MemberActivityHistory = use('App/Models/MemberActivityHistory')
const MemberActivityLogger = use('App/Helpers/MemberActivityLogger')
const Email = use('App/Lib/Email')
const WhatsappAPI = use('App/Lib/WhatsappAPI')
const uuid = use('uuid')

class MemberController {
    generateVerificationToken() {
        return `${Math.floor(Math.random() * (999999 - 100000 + 1)) + 100000}`
    }

    normalizeEmail(email) {
        return `${email || ''}`.trim().toLowerCase()
    }

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    }

    normalizePhone(phone) {
        let normalized = `${phone || ''}`.trim().replace(/[\s-]/g, '')

        if (normalized[0] === '+') {
            normalized = normalized.replace('+', '')
        }

        if (normalized[0] === '0') {
            normalized = normalized.replace(/^0/, '62')
        }

        return normalized
    }

    isValidPhone(phone) {
        return /^628[1-9]\d{7,11}$/.test(phone)
    }

    async cancelPendingContactVerifications(memberId, type) {
        await MemberContactVerification.query()
            .where('member_id', memberId)
            .where('type', type)
            .where('status', 'pending')
            .update({ status: 'cancelled' })
    }

    async findPendingContactVerification(memberId, type, target) {
        return MemberContactVerification.query()
            .where('member_id', memberId)
            .where('type', type)
            .where('target', target)
            .where('status', 'pending')
            .where('token_valid_until', '>', moment().format('YYYY-MM-DD HH:mm:ss'))
            .orderBy('member_contact_verification_id', 'desc')
            .first()
    }

    async findActiveContactVerification(memberId, type) {
        return MemberContactVerification.query()
            .where('member_id', memberId)
            .where('type', type)
            .where('status', 'pending')
            .where('token_valid_until', '>', moment().format('YYYY-MM-DD HH:mm:ss'))
            .orderBy('member_contact_verification_id', 'desc')
            .first()
    }

    getVerificationCooldownPayload(verification) {
        if (!verification) return null

        const expiresInSeconds = Math.max(
            0,
            moment(verification.token_valid_until).diff(moment(), 'seconds')
        )

        return {
            delivery_status: 'active',
            type: verification.type,
            target: verification.target,
            token_valid_until: verification.token_valid_until,
            expires_in_seconds: expiresInSeconds,
            can_resend_at: verification.token_valid_until
        }
    }

    queueContactVerificationDelivery({ verificationId, type, target, token }) {
        const validityPeriod = Env.get('TOKEN_VALIDITY_PERIODE') || 5
        const sendToken = async () => {
            try {
                if (type === 'email') {
                    await Email.send({
                        email: target,
                        subject: 'Token Verifikasi Email',
                        message: `SANGAT RAHASIA! Token verifikasi email Anda adalah ${token}, berlaku ${validityPeriod} menit`
                    })
                    return
                }

                await WhatsappAPI.send({
                    phone: target,
                    message: `SANGAT RAHASIA! Token verifikasi nomor telepon Anda adalah ${token}, berlaku ${validityPeriod} menit`
                })
            } catch (error) {
                console.log('[contact-verification] failed to send token', {
                    verificationId,
                    type,
                    target,
                    message: error.message
                })

                try {
                    const verification = await MemberContactVerification.query()
                        .where('member_contact_verification_id', verificationId)
                        .where('status', 'pending')
                        .first()

                    if (verification) {
                        verification.status = 'cancelled'
                        await verification.save()
                    }
                } catch (updateError) {
                    console.log('[contact-verification] failed to cancel token', updateError.message)
                }
            }
        }

        setImmediate(sendToken)
    }

    async auth({request, response, auth}) {
        const partner = await Partner.query().where('partner_id', auth.user.default_partner_id).first()
        auth.user.partner = {
            primary_color: partner.primary_color,
            primary_color_hover: partner.primary_color_hover
        }
        return response.json({
            status: true,
            data: auth.user
        })
    }
    async register({request, response, auth}) {
        // return response.json(request.all())
        let member, memberPartner

        
        // const trx = await Database.beginTransaction()
        const m = Member.query()
        if(request.all().lid_type == 'phone'){
            m.where('phone',request.all().phone)
        }else{
            m.where('email',request.all().email)
        }
        
        member = await m.first()
        // return response.json(member)
        try {
            if(member){
                // return response.json({
                //     status: true,
                //     registered: true,
                //     message: "member already registered"
                // })
                member.default_partner_id = request.all().partner_id
                member.lid = request.all().lid_type == 'phone' ? request.all().phone : request.all().email
                await member.save()
                memberPartner = await MemberPartner.query()
                .where('member_id',member.member_id)
                .where('partner_id',request.all().partner_id)
                .first()
                if(!memberPartner){
                    memberPartner = new MemberPartner()
                    memberPartner.member_id = member.member_id
                    memberPartner.partner_id = request.all().partner_id
                    await memberPartner.save()
                    // await trx.commit()
                }

            }else{
                member = new Member()
                member.phone = request.all().phone
                member.email = request.all().email
                member.default_partner_id = request.all().partner_id
                member.lid = request.all().lid_type == 'phone' ? request.all().phone : request.all().email
                member.status = 'not active'
                await member.save()
                // await member.save(trx)
                memberPartner = new MemberPartner()
                memberPartner.member_id = member.member_id
                memberPartner.partner_id = request.all().partner_id
                await memberPartner.save()
                // await trx.commit()
                // kirim pesan melalui whatsapp
                Event.fire('new::member', member.toJSON())

            }

            // auth ... token

            member = await Member.query()
            .where('member_id',member.member_id)
            .with('member_partners')
            .first()
            
            const partner = await Partner.query().select('partner_id','name','logo','desc','howtogetpoint','company_slug')
            .where('partner_id',request.all().partner_id)
            .first()
            const token = await auth.authenticator('token').generate(member)

            return response.json({
                status: true,
                message: 'success',
                data: {...token,user:member,partner:request.all().partner_id}
            })

            

        } catch (error) {
            console.log(error.message)
            // await trx.rollback()
            return response.json({
                status: false,
                message : 'something wrong'
            })
        }
            
        
    }

    async sendpoint({request, response}) {
        // return response.json(request.all())
        const m = Member.query()
        if(request.all().lid_type == 'phone'){
            m.where('phone',request.all().phone)
        }else{
            m.where('email',request.all().email)
        }
        
        const member = await m.first()

        if(!member){
            return response.json({
                status: false,
                message: 'member not found'
            })
        }

        const partner = await Partner.find(request.all().partner_id)

        const data = {
            member:member.toJSON(),
            point:request.all().point,
            description: request.all().description,
            partner_id: request.all().partner_id,
            partner : partner.toJSON()
        }
        
        Event.fire('sendpoint::member', data)
        return response.json({
            status: true,
            message: 'has been added to the queue'
        })
    }

    async getpoint({request, response}) {
        // return response.json(request.all())
        const m = Member.query()
        
        where('phone',request.all().phone).with('point').first()
        if(!member){
            return response.json({
                status: false,
                message: 'member not found'
            })
        }

        return response.json({
            status: true,
            data: member

        })

    }

    async getvoucher({request, response}) {
        // return request.all()
        // Decrypt
        const now = moment().format('YYYY-MM-DD HH:mm:ss')
        try {
            var bytes  = CryptoJS.AES.decrypt(request.all().code, request.all().sid);
            // console.log(bytes)
            var originalText = bytes.toString(CryptoJS.enc.Utf8);
            console.log(originalText)
            if(originalText === '') throw "500"
            const mv = await MemberVoucher.query()
            .where('member_voucher_id',originalText).where('used','0')
            .where('expire_date','>=',now)
            .with('voucher', (voucher) => {
                voucher.with('partner')
            })
            .with('member')
            .first()
            return response.json({
                status: true,
                data: mv
            })
                
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: 'invalid voucher'
            })            
        }
        
        
    }

    async profile({request, response, auth}){

        const data = await Member.query()
        .where('member_id',auth.user.member_id)
        .with('point')
        .with('member_voucher',(build)=>{
            build.with('voucher', (voucher) => {
                voucher.with('partner')
            }).where('member_vouchers.used','0')
            .where('expire_date','>',moment().format('YYYY-MM-DD HH:mm:ss'))
        })
        .first()

        const emailCooldown = await this.findActiveContactVerification(auth.user.member_id, 'email')
        const phoneCooldown = await this.findActiveContactVerification(auth.user.member_id, 'phone')

        return response.json({
            status: true,
            data: {
                ...data.toJSON(),
                contact_verification_cooldown: {
                    email: this.getVerificationCooldownPayload(emailCooldown),
                    phone: this.getVerificationCooldownPayload(phoneCooldown)
                }
            }
        })
    }

    async activity_history({request, response, auth}) {
        const page = request.all().page || 1
        const rows = request.all().rows || 10

        const data = await MemberActivityHistory.query()
            .where('member_id', auth.user.member_id)
            .filter(request.all().filter)
            .order(request.all().order)
            .orderBy('member_activity_history_id', 'desc')
            .paginate(page, rows)

        return response.json({
            status: true,
            data
        })
    }

    async record_product_page_visit({request, response, auth}) {
        const itemSlug = request.all().item_slug || request.all().slug || null
        const isDetailVisit = Boolean(itemSlug)
        const memberId = auth?.user?.member_id || null
        const visitorId = memberId ? null : `${request.all().visitor_id || ''}`.trim().slice(0, 100)

        if (!memberId && !visitorId) {
            return response.json({
                status: false,
                message: 'visitor_id is required'
            })
        }

        await MemberActivityLogger.record({
            memberId,
            visitorId,
            activityType: isDetailVisit ? 'product_detail_visited' : 'product_page_visited',
            request,
            description: isDetailVisit ? 'Mengunjungi detail produk' : 'Mengunjungi halaman produk',
            metadata: {
                page: request.all().page || (isDetailVisit ? `/product/${itemSlug}` : '/product'),
                item_slug: itemSlug,
                item_id: request.all().item_id || null,
                category_display_id: request.all().category_display_id || null
            },
            dedupeSeconds: 10
        })

        return response.json({
            status: true,
            message: 'activity recorded'
        })
    }

    async profile_update({request, response, auth}){

        const data = await Member.query()
        .where('member_id',auth.user.member_id)
        .with('point')
        .first()

        const req = request.all()

        if (Object.prototype.hasOwnProperty.call(req, 'firstname')) {
            data.firstname = req.firstname
        }

        if (Object.prototype.hasOwnProperty.call(req, 'lastname')) {
            data.lastname = req.lastname
        }

        if (Object.prototype.hasOwnProperty.call(req, 'image_profile')) {
            data.image_profile = req.image_profile
        }

        await data.save()

        await MemberActivityLogger.record({
            memberId: auth.user.member_id,
            activityType: 'profile_updated',
            request,
            description: 'Update profil member',
            metadata: {
                changed_fields: Object.keys(req).filter((field) => ['firstname', 'lastname', 'image_profile'].includes(field))
            }
        })

        return response.json({
            status: true,
            message: "success",
            data: data
        })
    }

    async upload_profile_photo({request, response, auth}) {
        const profilePhoto = request.file('photo', {
            types: ['image'],
            extnames: ['jpg', 'jpeg', 'png', 'webp'],
            size: '5mb'
        })

        if (!profilePhoto) {
            return response.json({
                status: false,
                message: 'photo is required'
            })
        }

        const uploadDir = Helpers.publicPath('uploads/profile')
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
        }

        const fileName = `${auth.user.member_id}-${Date.now()}-${uuid.v4()}.${profilePhoto.extname}`
        await profilePhoto.move(uploadDir, {
            name: fileName,
            overwrite: false
        })

        if (!profilePhoto.moved()) {
            return response.json({
                status: false,
                message: profilePhoto.error().message
            })
        }

        const imageUrl = `${Env.get('APP_URL')}/uploads/profile/${fileName}`
        const member = await Member.query()
            .where('member_id', auth.user.member_id)
            .first()

        member.image_profile = imageUrl
        await member.save()

        await MemberActivityLogger.record({
            memberId: auth.user.member_id,
            activityType: 'profile_photo_updated',
            request,
            description: 'Update foto profil member'
        })

        return response.json({
            status: true,
            message: 'photo uploaded',
            data: {
                image_profile: imageUrl
            }
        })
    }

    async request_email_verification({request, response, auth}) {
        const email = this.normalizeEmail(request.all().email)

        if (!email || !this.isValidEmail(email)) {
            return response.json({
                status: false,
                message: 'invalid email'
            })
        }

        const member = await Member.query().where('member_id', auth.user.member_id).first()
        const usedByOtherMember = await Member.query()
            .where('email', email)
            .whereNot('member_id', auth.user.member_id)
            .first()

        if (usedByOtherMember) {
            return response.json({
                status: false,
                message: 'email already used'
            })
        }

        if (member.email === email && member.verified_email === '1') {
            return response.json({
                status: true,
                message: 'email already verified',
                already_verified: true
            })
        }

        const activeVerification = await this.findActiveContactVerification(auth.user.member_id, 'email')
        if (activeVerification) {
            await MemberActivityLogger.record({
                memberId: auth.user.member_id,
                activityType: 'email_verification_requested',
                request,
                description: 'Membuka token verifikasi email yang masih aktif',
                metadata: {
                    target: activeVerification.target,
                    already_active: true
                }
            })

            return response.json({
                status: true,
                message: 'Token verifikasi email masih aktif',
                already_active: true,
                data: this.getVerificationCooldownPayload(activeVerification)
            })
        }

        const token = this.generateVerificationToken()
        const tokenValidUntil = moment()
            .add(Env.get('TOKEN_VALIDITY_PERIODE') || 5, 'minutes')
            .format('YYYY-MM-DD HH:mm:ss')

        await this.cancelPendingContactVerifications(auth.user.member_id, 'email')

        const verification = new MemberContactVerification()
        verification.member_id = auth.user.member_id
        verification.type = 'email'
        verification.target = email
        verification.token = token
        verification.token_valid_until = tokenValidUntil
        verification.status = 'pending'
        await verification.save()

        this.queueContactVerificationDelivery({
            verificationId: verification.member_contact_verification_id,
            type: 'email',
            target: email,
            token
        })

        await MemberActivityLogger.record({
            memberId: auth.user.member_id,
            activityType: 'email_verification_requested',
            request,
            description: 'Request verifikasi email',
            metadata: {
                target: email
            }
        })

        return response.json({
            status: true,
            message: 'Token verifikasi email telah dikirim',
            data: {
                ...this.getVerificationCooldownPayload(verification),
                delivery_status: 'queued'
            }
        })
    }

    async verify_email({request, response, auth}) {
        const email = this.normalizeEmail(request.all().email)
        const token = `${request.all().token || ''}`.trim()

        if (!email || !this.isValidEmail(email)) {
            return response.json({
                status: false,
                message: 'invalid email'
            })
        }

        if (!token || token.length !== 6) {
            return response.json({
                status: false,
                message: 'invalid token'
            })
        }

        const verification = await this.findPendingContactVerification(auth.user.member_id, 'email', email)
        if (!verification) {
            return response.json({
                status: false,
                message: 'token expired'
            })
        }

        const isValidToken = await Hash.verify(token, verification.token)
        if (!isValidToken) {
            return response.json({
                status: false,
                message: 'invalid token'
            })
        }

        const usedByOtherMember = await Member.query()
            .where('email', email)
            .whereNot('member_id', auth.user.member_id)
            .first()

        if (usedByOtherMember) {
            verification.status = 'cancelled'
            await verification.save()

            return response.json({
                status: false,
                message: 'email already used'
            })
        }

        const member = await Member.query().where('member_id', auth.user.member_id).first()
        const oldEmail = member.email

        member.email = email
        member.verified_email = '1'
        if (!member.lid || member.lid === oldEmail) {
            member.lid = email
        }
        await member.save()

        verification.status = 'verified'
        await verification.save()

        await MemberActivityLogger.record({
            memberId: auth.user.member_id,
            activityType: 'email_verified',
            request,
            description: 'Email member berhasil diverifikasi',
            metadata: {
                target: email
            }
        })

        return response.json({
            status: true,
            message: 'email verified',
            data: member
        })
    }

    async request_phone_verification({request, response, auth}) {
        const phone = this.normalizePhone(request.all().phone)

        if (!phone || !this.isValidPhone(phone)) {
            return response.json({
                status: false,
                message: 'invalid phone number'
            })
        }

        const member = await Member.query().where('member_id', auth.user.member_id).first()
        const usedByOtherMember = await Member.query()
            .where('phone', phone)
            .whereNot('member_id', auth.user.member_id)
            .first()

        if (usedByOtherMember) {
            return response.json({
                status: false,
                message: 'phone already used'
            })
        }

        if (member.phone === phone && member.verified_phone === '1') {
            return response.json({
                status: true,
                message: 'phone already verified',
                already_verified: true
            })
        }

        const activeVerification = await this.findActiveContactVerification(auth.user.member_id, 'phone')
        if (activeVerification) {
            await MemberActivityLogger.record({
                memberId: auth.user.member_id,
                activityType: 'phone_verification_requested',
                request,
                description: 'Membuka token verifikasi nomor telepon yang masih aktif',
                metadata: {
                    target: activeVerification.target,
                    already_active: true
                }
            })

            return response.json({
                status: true,
                message: 'Token verifikasi nomor telepon masih aktif',
                already_active: true,
                data: this.getVerificationCooldownPayload(activeVerification)
            })
        }

        const token = this.generateVerificationToken()
        const tokenValidUntil = moment()
            .add(Env.get('TOKEN_VALIDITY_PERIODE') || 5, 'minutes')
            .format('YYYY-MM-DD HH:mm:ss')

        await this.cancelPendingContactVerifications(auth.user.member_id, 'phone')

        const verification = new MemberContactVerification()
        verification.member_id = auth.user.member_id
        verification.type = 'phone'
        verification.target = phone
        verification.token = token
        verification.token_valid_until = tokenValidUntil
        verification.status = 'pending'
        await verification.save()

        this.queueContactVerificationDelivery({
            verificationId: verification.member_contact_verification_id,
            type: 'phone',
            target: phone,
            token
        })

        await MemberActivityLogger.record({
            memberId: auth.user.member_id,
            activityType: 'phone_verification_requested',
            request,
            description: 'Request verifikasi nomor telepon',
            metadata: {
                target: phone
            }
        })

        return response.json({
            status: true,
            message: 'Token verifikasi nomor telepon telah dikirim',
            data: {
                ...this.getVerificationCooldownPayload(verification),
                delivery_status: 'queued'
            }
        })
    }

    async verify_phone({request, response, auth}) {
        const phone = this.normalizePhone(request.all().phone)
        const token = `${request.all().token || ''}`.trim()

        if (!phone || !this.isValidPhone(phone)) {
            return response.json({
                status: false,
                message: 'invalid phone number'
            })
        }

        if (!token || token.length !== 6) {
            return response.json({
                status: false,
                message: 'invalid token'
            })
        }

        const verification = await this.findPendingContactVerification(auth.user.member_id, 'phone', phone)
        if (!verification) {
            return response.json({
                status: false,
                message: 'token expired'
            })
        }

        const isValidToken = await Hash.verify(token, verification.token)
        if (!isValidToken) {
            return response.json({
                status: false,
                message: 'invalid token'
            })
        }

        const usedByOtherMember = await Member.query()
            .where('phone', phone)
            .whereNot('member_id', auth.user.member_id)
            .first()

        if (usedByOtherMember) {
            verification.status = 'cancelled'
            await verification.save()

            return response.json({
                status: false,
                message: 'phone already used'
            })
        }

        const member = await Member.query().where('member_id', auth.user.member_id).first()
        const oldPhone = member.phone

        member.phone = phone
        member.verified_phone = '1'
        if (!member.lid || member.lid === oldPhone) {
            member.lid = phone
        }
        await member.save()

        verification.status = 'verified'
        await verification.save()

        await MemberActivityLogger.record({
            memberId: auth.user.member_id,
            activityType: 'phone_verified',
            request,
            description: 'Nomor telepon member berhasil diverifikasi',
            metadata: {
                target: phone
            }
        })

        return response.json({
            status: true,
            message: 'phone verified',
            data: member
        })
    }


    async points({request, response, auth}) {
        const data = await PointHistory.query()
        .where('member_id',auth.user.member_id)
        .filter(request.all().filter)
        .order(request.all().order)
        .orderBy('point_history_id','desc')
        .paginate(request.all().page, request.all().rows)

        return response.json({
            status: true,
            data: data
        })
    }

    async vouchers({request, response, auth}) {
        let pid
        const data = Voucher.query()
        .with('partner')
        .where('status','active')        
        .filter(request.all().filter)
        .order(request.all().order)
        const out = await data.paginate(request.all().page, request.all().rows)
        return response.json({
            status: true,
            data: out
        })
    }

    async redeem({request,response, auth}){
        const point = await Point.query().where('member_id',auth.user.member_id).first()
        if(!point) {
            return response.json({
                status: false,
                message: 'Yout point not enough'
            })
        }
        const voucher = await Voucher.query().where('status','active').where('voucher_id', request.all().voucher_id).first()
        if(!voucher) {
            return response.json({
                status: false,
                message: 'invalid voucher'
            })
        }

        if(voucher.number_point > point.point) {
            return response.json({
                status: false,
                message: 'Yout point not enough'
            })
        }

        Event.fire('redeem::member',{
            point: point.toJSON(),
            voucher: voucher.toJSON()
        })
        
        return response.json({
            status: true,
            message: 'has been added to the queue'
        })
    }

    async request_redeem({request, response, auth}) {
        const member = await Member.query()
            .where('member_id', auth.user.member_id)
            .first()

        if (!member) {
            return response.json({
                status: false,
                message: 'member not found'
            })
        }

        const voucher = await Voucher.query()
            .where('status', 'active')
            .where('voucher_id', request.all().voucher_id)
            .first()

        if (!voucher) {
            return response.json({
                status: false,
                message: 'invalid voucher'
            })
        }

        const result = await VoucherRedeemConfirmation.createRequest(member, voucher)
        if (!result.status) {
            return response.json({
                status: false,
                message: result.message
            })
        }

        const confirmation = result.confirmation
        const channels = confirmation.channels ? confirmation.channels.split(',') : []

        return response.json({
            status: true,
            message: result.already_active ? 'Token masih aktif' : 'Token konfirmasi telah dikirim',
            data: {
                voucher_redeem_confirmation_id: confirmation.voucher_redeem_confirmation_id,
                voucher_id: confirmation.voucher_id,
                channels: channels,
                token_valid_until: confirmation.token_valid_until,
                expires_in_seconds: VoucherRedeemConfirmation.getExpiresInSeconds(confirmation.token_valid_until),
                already_active: result.already_active
            }
        })
    }

    async verify_redeem({request, response, auth}) {
        if (!request.all().voucher_redeem_confirmation_id) {
            return response.json({
                status: false,
                message: 'voucher_redeem_confirmation_id is required'
            })
        }

        if (!request.all().token) {
            return response.json({
                status: false,
                message: 'token is required'
            })
        }

        const result = await VoucherRedeemConfirmation.verify({
            memberId: auth.user.member_id,
            confirmationId: request.all().voucher_redeem_confirmation_id,
            token: request.all().token
        })

        return response.json(result)
    }

    async redeem_voucher({request, response, auth}) {
        const data = await MemberVoucher.query()
        .with('voucher', (voucher) => {
            voucher.with('partner')
        })
        .with('member')
        .where('member_id', auth.user.member_id)
        .where('expire_date','>',moment().format('YYYY-MM-DD HH:mm:ss'))
        .where('used','0')
        .paginate(request.all().page, request.all().rows)
        return response.json({
            status: true,
            data: data
        })
    }

    async voucher_exchange({request, response}){

        const trx = await Database.beginTransaction()

        const member_voucher = await MemberVoucher.query()
        .where('member_voucher_id', request.all().member_voucher_id)
        .where('used','0')
        .first()

        if(!member_voucher){
            return response.json({
                status: true,
                message: 'invalid voucher'
            })
        }

        const rm = await RedeemMerchant.query().where('partner_id', request.all().partner_id).where('store_id', request.all().store_id).first()
        if(!rm){
            return response.json({
                status: false,
                message: 'invalid store'
            })
        }

        try {

            const ve = new VoucherExchange()

            ve.member_voucher_id = request.all().member_voucher_id
            ve.redeem_merchant_id = rm.redeem_merchant_id
            ve.note = request.all().note
            await ve.save(trx)

            member_voucher.used = '1'
            await member_voucher.save(trx)

            await trx.commit()

            return response.json({
                status: true,
                message: 'success'
             })

            

         } catch (error) {
            console.log(error)
            await trx.rollback()
            return response.json({
                status: false,
                message: 'something error'
            })
        }

    }

    // Admin Member
    async gets({request, response, auth}) {
        const data = await Member.query()
        .filter(request.all().filter)
        .order(request.all().filter)
        .paginate(request.all().page, request.all().rows)

        return response.json({
            status: true,
            data : data
        })
    }

    async get({request, response, auth}) {
        const data = await Member.query()
        .where('member_id',request.all().member_id)
        .filter(request.all().filter)
        .order(request.all().filter)
        .first()

        return response.json({
            status: true,
            data : data
        })
    }

    async member_points({request, response, auth}) {
        // Get point total for member
        const point = await Point.query()
            .where('member_id', request.all().member_id)
            .first()

        // Get point history with pagination
        const data = await PointHistory.query()
            .where('member_id',request.all().member_id)
            .with('member')
            .filter(request.all().filter)
            .order(request.all().order)
            .orderBy('point_history_id','desc')
            .paginate(request.all().page, request.all().rows)

        return response.json({
            status: true,
            data: {
                ...data.toJSON(),
                total_point: point ? point.point : 0
            }
        })
    }

    async member_vouchers({request, response, auth}) {
        const data = await MemberVoucher.query()
        .with('voucher', (voucher) => {
            voucher.with('partner')
        })
        .with('member')
        .where('member_id', request.all().member_id)
        // .where('expire_date','>',moment().format('YYYY-MM-DD HH:mm:ss'))
        // .where('used','0')
        .paginate(request.all().page, request.all().rows)
        return response.json({
            status: true,
            data: data
        })
    }

    async request_auth({request, response, auth}) {
        // return response.json(request.all())
        const partner = await Partner.query()
        .where('partner_id', request.all().partner_id)
        .first()
        
        const member = await Member.query().select(
            'members.member_id',
            'phone',
            'email',
            'firstname',
            'lastname',
            'image_profile'
        )
        .innerJoin('member_partners','member_partners.member_id','members.member_id')
        .where('email', request.all().email)
        .first()

        const token = await auth.authenticator('token').generate(member)

        return response.json({
            status: true,
            data: token,
            member: member
        })

    }
}

module.exports = MemberController
