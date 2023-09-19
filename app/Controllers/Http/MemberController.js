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
const moment = use('moment')


class MemberController {
    async register({request, response}) {
        let member 
        member = await Member.query().where('phone',request.all().phone).first()
        if(member){
            return response.json({
                status: true,
                registered: true,
                message: "member already registered"
            })
        }else{
            try {
                member = new Member()
                member.phone = request.all().phone
                member.status = 'not active'
                await member.save()

                // kirim pesan melalui whatsapp
                Event.fire('new::member', member)

                return response.json({
                    status : true,
                    registered: true,
                    message: 'success'

                })                
            } catch (error) {
                return response.json({
                    status: false,
                    message : 'something wrong'
                })
            }
            
        }
    }

    async sendpoint({request, response}) {
        // return response.json(request.all())
        const getPoint = await GetPoint.query()
        .where('partner_id',request.all().partner_id)
        .where('code',request.all().code)
        .with('partner')
        .first()

        if(!getPoint){
            return response.json({
                status: false,
                message: 'invalid code'
            })
        }

        const member = await Member.query().where('phone',request.all().phone).first()
        if(!member){
            return response.json({
                status: false,
                message: 'member not found'
            })
        }

        const data = {
            member:member.toJSON(),
            getPoint:getPoint.toJSON()
        }
        Event.fire('sendpoint::member', data)
        return response.json({
            status: true,
            message: 'has been added to the queue'
        })
    }

    async getpoint({request, response}) {
        const member = await Member.query().where('phone',request.all().phone).with('point').first()
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

    async profile({request, response, auth}){

        const data = await Member.query()
        .where('member_id',auth.user.member_id)
        .with('point')
        .with('member_voucher',(build)=>{
            build.with('voucher')
        })
        .first()
        return response.json({
            status: true,
            data: data
        })
    }

    async profile_update({request, response, auth}){

        const data = await Member.query()
        .where('member_id',auth.user.member_id)
        .with('point')
        .first()

        data.email = request.all().email ? request.all().email : data.email
        data.firstname = request.all().firstname ? request.all().firstname : data.firstname
        data.lastname = request.all().lastname ? request.all().lastname : data.lastname
        data.image_profile = request.all().image_profile ? request.all().image_profile : data.image_profile

        await data.save()

        return response.json({
            status: true,
            message: "success",
            data: data
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

    async redeem_voucher({request, response, auth}) {
        const data = await MemberVoucher.query()
        .with('voucher')
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
        const data = await PointHistory.query()
        .where('member_id',request.all().member_id)
        .with('member')
        .filter(request.all().filter)
        .order(request.all().order)
        .orderBy('point_history_id','desc')
        .paginate(request.all().page, request.all().rows)

        return response.json({
            status: true,
            data: data
        })
    }

    async member_vouchers({request, response, auth}) {
        const data = await MemberVoucher.query()
        .with('voucher')
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
}

module.exports = MemberController
