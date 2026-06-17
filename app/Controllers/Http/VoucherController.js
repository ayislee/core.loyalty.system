'use strict'
const Voucher = use('App/Models/Voucher')
const UserPartner = use('App/Models/UserPartner')
const ThisLib = use('App/Lib/LoyaltyLib')

const DISCOUNT_CALCULATION_TYPES = ['fixed_amount', 'percentage']
const VOUCHER_TYPES = ['free', 'amount', 'free_delivery']

const hasValue = (value) => {
    return value !== undefined && value !== null && `${value}`.trim() !== ''
}

const normalizeDiscountPayload = (req, currentVoucher = null) => {
    const voucherType = hasValue(req.type) ? req.type : currentVoucher ? currentVoucher.type : null

    if (!VOUCHER_TYPES.includes(voucherType)) {
        return {
            status: false,
            message: 'type must be free, amount, or free_delivery'
        }
    }

    if (voucherType !== 'amount') {
        return {
            status: true,
            voucherType,
            discountCalculationType: null,
            discountValue: null
        }
    }

    const discountCalculationType = hasValue(req.discount_calculation_type)
        ? req.discount_calculation_type
        : currentVoucher
            ? currentVoucher.discount_calculation_type
            : null

    if (!DISCOUNT_CALCULATION_TYPES.includes(discountCalculationType)) {
        return {
            status: false,
            message: 'discount_calculation_type must be fixed_amount or percentage'
        }
    }

    const rawDiscountValue = hasValue(req.discount_value)
        ? req.discount_value
        : currentVoucher
            ? currentVoucher.discount_value
            : null

    if (!hasValue(rawDiscountValue)) {
        return {
            status: false,
            message: 'discount_value is required for amount voucher'
        }
    }

    const discountValue = Number(rawDiscountValue)
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
        return {
            status: false,
            message: 'discount_value must be greater than 0'
        }
    }

    if (discountCalculationType === 'percentage' && discountValue > 100) {
        return {
            status: false,
            message: 'percentage discount_value must be less than or equal to 100'
        }
    }

    return {
        status: true,
        voucherType,
        discountCalculationType,
        discountValue
    }
}

class VoucherController {
    async gets({request, response, auth}){
        
        let pid
        const data = Voucher.query()
        .with('partner')
        .with('created')
        .with('updated')
        .filter(request.all().filter)
        .order(request.all().order)
        if(auth.user.type === 'partner'){
            // partner's voucher
            pid = await ThisLib.getPartnerIDFromUser(auth.user.user_id)
            if(pid){
                data.where('partner_id', pid)
            }else{
                return response.json({
                    status: true,
                    data: {
                        total: 0,
                        perPage: request.all().rows,
                        page: 1,
                        lastPage: 0,
                    }
                })
            }
            
            
        }

        const out = await data.paginate(request.all().page, request.all().rows)
        return response.json({
            status: true,
            data: out
        })
        
    }

    async get({request, response, auth}) {
        let pid
        const data = Voucher.query()
        .with('partner')
        .with('created')
        .with('updated')
        .filter(request.all().filter)
        .order(request.all().order)
        if(auth.user.type === 'partner'){
            // partner's voucher
            pid = await ThisLib.getPartnerIDFromUser(auth.user.user_id)
            if(pid){
                data.where('partner_id', pid)
            }else{
                return response.json({
                    status: true,
                    data: {
                        total: 0,
                        perPage: request.all().rows,
                        page: 1,
                        lastPage: 0,
                    }
                })
            }
        }
        const out = await data.where('voucher_id',request.all().voucher_id).first()
        return response.json({
            status: true,
            data: out
        })
    }

    async create({request, response, auth}) {
        const req = request.all()
        const discountPayload = normalizeDiscountPayload(req)
        if (!discountPayload.status) {
            return response.json({
                status: false,
                message: discountPayload.message
            })
        }

        let pid
        const voucher = new Voucher()
        voucher.name = req.name
        voucher.sku = hasValue(req.sku) ? req.sku : null
        voucher.status = req.status
        voucher.description = req.description
        voucher.duration = req.duration
        voucher.product_image = req.product_image
        voucher.voucher_image = req.voucher_image
        voucher.number_point = req.number_point
        voucher.created_by = auth.user.user_id
        voucher.updated_by = auth.user.user_id
        voucher.type = discountPayload.voucherType
        voucher.discount_calculation_type = discountPayload.discountCalculationType
        voucher.discount_value = discountPayload.discountValue

        if(auth.user.type === 'admin'){
            voucher.partner_id = req.partner_id
            
        }else{
            pid = await ThisLib.getPartnerIDFromUser(auth.user.user_id)
            console.log('pid',pid)
            if(pid){
                voucher.partner_id = pid
            }else{
                return response.json({
                    status: false,
                    message: 'You cant create Voucher'
                })
            }
        }

        await voucher.save()
        return response.json({
            status: true,
            message: 'success', 
            data: voucher
        })
    }
    async edit({request, response, auth}) {
        const req = request.all()
        const data = await Voucher.find(req.voucher_id)
        if (!data) {
            return response.json({
                status: false,
                message: 'Voucher not found'
            })
        }

        const discountPayload = normalizeDiscountPayload(req, data)
        if (!discountPayload.status) {
            return response.json({
                status: false,
                message: discountPayload.message
            })
        }

        data.name = hasValue(req.name) ? req.name : data.name
        if (Object.prototype.hasOwnProperty.call(req, 'sku')) {
            data.sku = hasValue(req.sku) ? req.sku : null
        }
        data.product_image = hasValue(req.product_image) ? req.product_image : data.product_image
        data.voucher_image = hasValue(req.voucher_image) ? req.voucher_image : data.voucher_image
        data.number_point = hasValue(req.number_point) ? req.number_point : data.number_point
        data.status = hasValue(req.status) ? req.status : data.status
        data.description = hasValue(req.description) ? req.description : data.description
        data.duration = hasValue(req.duration) ? req.duration : data.duration
        data.type = discountPayload.voucherType
        data.discount_calculation_type = discountPayload.discountCalculationType
        data.discount_value = discountPayload.discountValue
        data.updated_by = auth.user.user_id
        await data.save()

        return response.json({
            status: true,
            message: 'success',
            data: data
        })
        
        
        
        

        return response.json(request.all())
    }
}

module.exports = VoucherController
