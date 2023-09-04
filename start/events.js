"use strict";
const Event = use('Event')
const PointHistory = use('App/Models/PointHistory')
const Point = use('App/Models/Point')
const MemberVoucher = use('App/Models/MemberVoucher')
const Database = use('Database')
const uuid = use('uuid')
const moment = use('moment')

Event.on('new::member', async (member) => {
    console.log('New member action')
    // kirim whataps

})

Event.on('sendpoint::member', async (data) => {
    console.log(data)
    const trx = await Database.beginTransaction()
    try {
        // console.log(uuid.v4())
        const pH = new PointHistory()
        pH.member_id = data.member.member_id
        pH.point = data.getPoint.point_receive
        pH.ref_id = uuid.v4()
        pH.desc = `${data.getPoint.name} [${data.getPoint.partner.name}]`
        await pH.save(trx)

        
        await trx.commit()
        
    } catch (error) {
        console.log(error)
        await trx.rollback()
    }
})


Event.on('whatsapp::member', async (data) => {
    console.log(data)
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
        await mVoucher.save(trx)
        await trx.commit()
        console.log('success')

    } catch (error) {
        console.log(error)
        await trx.rollback()
    }
})