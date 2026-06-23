'use strict'

const Env = use('Env')

const DISCOUNT_CALCULATION_TYPES = ['fixed_amount', 'percentage']
const VOUCHER_TYPES = ['free', 'amount', 'free_delivery']

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== ''

const toPositiveNumber = (value) => {
    if (!hasValue(value)) {
        return null
    }

    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const getLegacyAmount = (voucher) => {
    const pointValue = toPositiveNumber(Env.get('POINT')) || 1000
    const redeemedPoint = toPositiveNumber(voucher.number_point) || 0
    return pointValue * redeemedPoint
}

class VoucherSnapshot {
    static toMemberVoucherPayload(voucher) {
        const voucherType = voucher && VOUCHER_TYPES.includes(voucher.type) ? voucher.type : 'free'
        const redeemedPoint = toPositiveNumber(voucher ? voucher.number_point : null)

        const payload = {
            partner_id: voucher && voucher.partner_id ? voucher.partner_id : null,
            voucher_name_snapshot: voucher && voucher.name ? voucher.name : null,
            voucher_type: voucherType,
            discount_calculation_type: null,
            discount_value: null,
            redeemed_point: redeemedPoint,
            amount: null
        }

        if (voucherType !== 'amount') {
            return payload
        }

        const discountCalculationType = DISCOUNT_CALCULATION_TYPES.includes(voucher.discount_calculation_type)
            ? voucher.discount_calculation_type
            : null
        const discountValue = toPositiveNumber(voucher.discount_value)

        const isValidDiscountValue = discountCalculationType === 'percentage'
            ? discountValue && discountValue <= 100
            : discountValue

        if (discountCalculationType && isValidDiscountValue) {
            payload.discount_calculation_type = discountCalculationType
            payload.discount_value = discountValue
            payload.amount = discountCalculationType === 'fixed_amount' ? discountValue : null
            return payload
        }

        const legacyAmount = getLegacyAmount(voucher)
        payload.discount_calculation_type = 'fixed_amount'
        payload.discount_value = legacyAmount
        payload.amount = legacyAmount

        return payload
    }

    static applyToMemberVoucher(memberVoucher, voucher) {
        const payload = this.toMemberVoucherPayload(voucher)

        memberVoucher.voucher_type = payload.voucher_type
        memberVoucher.partner_id = payload.partner_id
        memberVoucher.voucher_name_snapshot = payload.voucher_name_snapshot
        memberVoucher.discount_calculation_type = payload.discount_calculation_type
        memberVoucher.discount_value = payload.discount_value
        memberVoucher.redeemed_point = payload.redeemed_point
        memberVoucher.amount = payload.amount

        return memberVoucher
    }
}

module.exports = VoucherSnapshot
