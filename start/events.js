"use strict";

const Voucher = use("App/Models/Voucher");

const Event = use('Event')
const PointHistory = use('App/Models/PointHistory')
const Point = use('App/Models/Point')
const Partner = use('App/Models/Partner')
const MemberVoucher = use('App/Models/MemberVoucher')
const Database = use('Database')
const uuid = use('uuid')
const moment = use('moment')
const Env = use('Env')
const WhatsappAPI = use('App/Lib/WhatsappAPI')

Event.on('new::member', async (member) => {
    console.log('New member action',member)
    // kirim whataps
    switch (Env.get('MESSAGE_TYPE')) {
        case 'WHATSAPP':
            
            break;
    
        default:
            // Default To SMS
            const data = {
                phone : member.phone
            }
            break;
    }

})

Event.on('sendpoint::member', async (data) => {
    console.log(data)
    const trx = await Database.beginTransaction()
    try {
        // console.log(uuid.v4())
        const partner = await Partner.query().where('partner_id',data.partner_id).first()
        const pH = new PointHistory()
        pH.member_id = data.member.member_id
        pH.point = data.point
        pH.ref_id = uuid.v4()
        pH.desc = `${data.description} [${partner.name}]`
        pH.partner_id = data.partner_id
        await pH.save(trx)

        
        await trx.commit()

        const message = `SELAMAT! Anda mendapat ${data.point} point dari ${data.partner.name}, tukarkan point anda dengan voucher menarik di ${Env.get('APP_ROOT')}`
        if(pH.point > 0){
            await WhatsappAPI.send({
                phone: data.member.phone,
                message: message
            })
        }
        

        
    } catch (error) {
        console.log(error)
        await trx.rollback()
    }
})


Event.on('token::member', async (data) => {
    // console.log(data)
    const message = `SANGAT RAHASIA! Jangan di informasikan ke pihak lain, token akses anda adalah : ${data.token}`
    data.message = message
    await WhatsappAPI.send({
        phone: data.member.phone,
        message: message
    })
    
})

Event.on('redeem::member', async (data) => {
    console.log(data)
    const trx = await Database.beginTransaction()
    try {

        
        const pH = new PointHistory()
        pH.member_id = data.point.member_id
        pH.ref_id = uuid.v4()
        pH.point = 0 - data.voucher.number_point 
        pH.desc = `Redeem ${data.voucher.name}`
        await pH.save(trx)

        const mVoucher = new MemberVoucher()
        mVoucher.member_id = data.point.member_id
        mVoucher.voucher_id = data.voucher.voucher_id
        mVoucher.voucher_code = uuid.v4()
        mVoucher.expire_date = moment().add(data.voucher.duration,'days').format('YYYY-MM-DD HH:mm:ss')
        mVoucher.amount = parseFloat(Env.get('POINT')) * data.voucher.number_point
        await mVoucher.save(trx)
        await trx.commit()
        console.log('success')

    } catch (error) {
        console.log(error)
        await trx.rollback()
    }
})