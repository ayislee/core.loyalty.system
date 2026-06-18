'use strict'
const axios = use('axios')
const Env = use('Env')
const Transaction = use('App/Models/Transaction')
const Partner = use('App/Models/Partner')
const Address = use('App/Models/Address')
const MemberVoucher = use('App/Models/MemberVoucher')
const ProductReviewEligibility = use('App/Helpers/ProductReviewEligibility')
const qs = use('qs')
const moment = use('moment')
const CryptoJS = require('crypto-js')

const parseJson = (value) => {
    if (!value) return null
    if (typeof value === 'object') return value

    try {
        return JSON.parse(value)
    } catch (error) {
        return null
    }
}

const toNullableNumber = (value) => {
    if (value === null || value === undefined || value === '') return null

    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

const fillPositiveNumber = (target, source, key) => {
    const targetValue = toNullableNumber(target?.[key])
    const sourceValue = toNullableNumber(source?.[key])

    if ((targetValue === null || targetValue <= 0) && sourceValue !== null && sourceValue > 0) {
        return sourceValue
    }

    return target?.[key]
}

const extractLocalTransactionData = (localTransaction) => {
    const responsePayload = parseJson(localTransaction?.response)
    return responsePayload?.data || responsePayload || null
}

const normalizeText = (value) => `${value || ''}`.trim()

const normalizeCompanySlug = (value) => normalizeText(value).toLowerCase()

const normalizeSku = (value) => normalizeText(value).toLowerCase()

const normalizeEmail = (value) => normalizeText(value).toLowerCase()

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))

const normalizePhone = (value) => {
    let phone = normalizeText(value).replace(/[\s-]/g, '')
    if (phone.startsWith('+')) phone = phone.slice(1)
    if (phone.startsWith('0')) phone = phone.replace(/^0/, '62')
    return phone
}

const isValidPhone = (value) => /^62[0-9]{8,14}$/.test(normalizePhone(value))

const resolveMarketplaceTransactionPath = (member) => {
    const lid = normalizeText(member?.lid)
    if (isValidEmail(lid)) {
        return `transaction/email/${encodeURIComponent(normalizeEmail(lid))}`
    }

    if (isValidPhone(lid)) {
        return `transaction/msisdn/${encodeURIComponent(normalizePhone(lid))}`
    }

    const email = normalizeEmail(member?.email)
    if (isValidEmail(email)) {
        return `transaction/email/${encodeURIComponent(email)}`
    }

    const phone = normalizePhone(member?.phone)

    if (isValidPhone(phone)) {
        return `transaction/msisdn/${encodeURIComponent(phone)}`
    }

    return null
}

const getMemberEmailCandidates = (member) => ([
    member?.lid,
    member?.email
])
    .map((value) => normalizeEmail(value))
    .filter((value) => isValidEmail(value))

const getMemberPhoneCandidates = (member) => ([
    member?.lid,
    member?.phone
])
    .map((value) => normalizePhone(value))
    .filter((value) => isValidPhone(value))

const isTransactionOwnedByMember = (transaction, member) => {
    const memberEmails = getMemberEmailCandidates(member)
    const memberPhones = getMemberPhoneCandidates(member)
    const transactionEmail = normalizeEmail(transaction?.customer_email)
    const transactionPhone = normalizePhone(transaction?.customer_msisdn)

    return Boolean(
        (transactionEmail && memberEmails.includes(transactionEmail)) ||
        (transactionPhone && memberPhones.includes(transactionPhone))
    )
}

const mergeLocalTransactionSnapshot = (transaction, localData) => {
    if (!transaction || !localData) return transaction

    return {
        ...localData,
        ...transaction,
        transaction_amount: fillPositiveNumber(transaction, localData, 'transaction_amount'),
        transaction_discount: fillPositiveNumber(transaction, localData, 'transaction_discount'),
        transaction_shipping_fee: fillPositiveNumber(transaction, localData, 'transaction_shipping_fee'),
        transaction_total_amount: fillPositiveNumber(transaction, localData, 'transaction_total_amount'),
        transaction_data: transaction?.transaction_data || localData?.transaction_data,
        shipping_service_detail: transaction?.shipping_service_detail || localData?.shipping_service_detail
    }
}

class TransactionController {
    voucherMatchesItems(memberVoucher, items = []) {
        const memberVoucherJson = memberVoucher?.toJSON ? memberVoucher.toJSON() : memberVoucher
        const voucherSku = normalizeSku(memberVoucherJson?.voucher?.sku || memberVoucherJson?.sku)
        if (!voucherSku) {
            return true
        }

        const itemSkus = (items || [])
            .flatMap((item) => [
                item?.item_sku,
                item?.sku,
                item?.product_sku,
                item?.menu_sku
            ])
            .map(normalizeSku)
            .filter(Boolean)

        if (itemSkus.length === 0) {
            return true
        }

        return itemSkus.includes(voucherSku)
    }

    async validateVoucherCompany({ voucherCode, checkoutCompanySlug, memberId, items = [] }) {
        if (!voucherCode) {
            return { status: true }
        }

        const normalizedCompanySlug = normalizeCompanySlug(checkoutCompanySlug)
        if (!normalizedCompanySlug) {
            return {
                status: false,
                message: 'company_slug is required'
            }
        }

        const partner = await Partner.query()
            .where('company_slug', normalizedCompanySlug)
            .first()

        if (!partner || !partner.server_id) {
            return {
                status: false,
                message: 'voucher not available for this company'
            }
        }

        try {
            const bytes = CryptoJS.AES.decrypt(voucherCode, partner.server_id)
            const memberVoucherId = bytes.toString(CryptoJS.enc.Utf8)

            if (!memberVoucherId) {
                return {
                    status: false,
                    message: 'voucher not available for this company'
                }
            }

            const memberVoucher = await MemberVoucher.query()
                .where('member_voucher_id', memberVoucherId)
                .where('member_id', memberId)
                .where('used', '0')
                .where('expire_date', '>=', moment().format('YYYY-MM-DD HH:mm:ss'))
                .with('voucher')
                .first()

            if (!memberVoucher) {
                return {
                    status: false,
                    message: 'invalid voucher'
                }
            }

            const memberVoucherJson = memberVoucher.toJSON()
            const voucherCompanySlug = normalizeCompanySlug(memberVoucherJson?.voucher?.partner?.company_slug)

            if (!voucherCompanySlug || voucherCompanySlug !== normalizedCompanySlug) {
                return {
                    status: false,
                    message: 'voucher not available for this company'
                }
            }

            if (!this.voucherMatchesItems(memberVoucherJson, items)) {
                return {
                    status: false,
                    message: 'voucher not match to any item'
                }
            }

            return {
                status: true,
                member_voucher_id: memberVoucherId
            }
        } catch (error) {
            return {
                status: false,
                message: 'voucher not available for this company'
            }
        }
    }

    async list({request, response, auth}){
        const req = request.all()
        const params = qs.stringify(req)
        const marketplaceTransactionPath = resolveMarketplaceTransactionPath(auth.user)

        if (!marketplaceTransactionPath) {
            return response.json({
                status: false,
                message: 'Email atau nomor telepon member tidak tersedia'
            })
        }

        // return response.json(params)
        try {
            const res = await axios.get(`${Env.get('MARKETPLACE_CORE')}${marketplaceTransactionPath}?${params}`)
            if(res.data.success){
                const decoratedData = await ProductReviewEligibility.decorateTransactionPayload(
                    res.data,
                    auth.user.member_id
                )
                return response.json({
                    status: true,
                    data: decoratedData
                })
            }else{
                return response.json(res.data)
            }
            return response.json(res.data)
        } catch (error) {
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async get({request, response, auth}){
        const req = request.all()
        const transactionId = req.transaction_id || req.id
        const transactionNumber = req.transaction_number || req.transaction_no || req.number

        if (!transactionId && !transactionNumber) {
            return response.badRequest({
                status: false,
                message: 'transaction_id atau transaction_number wajib diisi'
            })
        }

        try {
            let transaction = null

            if (transactionNumber) {
                const api = `${Env.get('MARKETPLACE_CORE')}transaction/number/${encodeURIComponent(transactionNumber)}`
                const res = await axios.get(api)
                const payload = res?.data || {}

                if (!payload.success) {
                    return response.status(404).json({
                        status: false,
                        message: payload.error || payload.message || 'Transaksi tidak ditemukan'
                    })
                }

                transaction = payload.data
            }

            if (!transaction && transactionId) {
                transaction = await ProductReviewEligibility.findMemberTransaction({
                    email: auth.user.email,
                    transactionId
                })
            }

            if (!transaction) {
                return response.status(404).json({
                    status: false,
                    message: 'Transaksi tidak ditemukan'
                })
            }

            if (!isTransactionOwnedByMember(transaction, auth.user)) {
                return response.status(403).json({
                    status: false,
                    message: 'Transaksi bukan milik member'
                })
            }

            const transactionReference = ProductReviewEligibility.extractTransactionReference(transaction, req)
            const localLookupValue = transactionReference.transaction_number || transactionNumber

            if (localLookupValue) {
                const localTransaction = await Transaction.query()
                    .where('member_id', auth.user.member_id)
                    .where('response', 'like', `%${localLookupValue}%`)
                    .orderBy('transaction_id', 'desc')
                    .first()

                transaction = mergeLocalTransactionSnapshot(
                    transaction,
                    extractLocalTransactionData(localTransaction)
                )
            }

            const decoratedTransactions = await ProductReviewEligibility.appendReviewEligibilityToTransactions(
                [transaction],
                auth.user.member_id
            )

            return response.json({
                status: true,
                data: decoratedTransactions[0] || transaction
            })
        } catch (error) {
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async receiveShipping({request, response, auth}){
        const req = request.all()
        const transactionNumber = req.transaction_number || req.transaction_no || req.number

        if (!transactionNumber) {
            return response.badRequest({
                status: false,
                message: 'transaction_number wajib diisi'
            })
        }

        try {
            const transactionRes = await axios.get(`${Env.get('MARKETPLACE_CORE')}transaction/number/${encodeURIComponent(transactionNumber)}`)
            const transactionPayload = transactionRes?.data || {}
            const transaction = transactionPayload.data

            if (!transactionPayload.success || !transaction) {
                return response.status(404).json({
                    status: false,
                    message: transactionPayload.error || transactionPayload.message || 'Transaksi tidak ditemukan'
                })
            }

            if (!isTransactionOwnedByMember(transaction, auth.user)) {
                return response.status(403).json({
                    status: false,
                    message: 'Transaksi bukan milik member'
                })
            }

            const transactionReference = ProductReviewEligibility.extractTransactionReference(transaction, req)
            const targetTransactionNumber = transactionReference.transaction_number || transactionNumber
            const api = `${Env.get('MARKETPLACE_CORE')}transaction/number/${encodeURIComponent(targetTransactionNumber)}/shipping/receive`
            const res = await axios.put(api, {})
            const payload = res?.data || {}

            if (payload.success) {
                return response.json({
                    status: true,
                    message: payload.success,
                    data: payload.data
                })
            }

            return response.json({
                status: false,
                message: payload.error || payload.message || 'Gagal memperbarui status pengiriman',
                data: payload.data || null
            })
        } catch (error) {
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async complete({request, response, auth}){
        const req = request.all()
        const transactionNumber = req.transaction_number || req.transaction_no || req.number

        if (!transactionNumber) {
            return response.badRequest({
                status: false,
                message: 'transaction_number wajib diisi'
            })
        }

        try {
            const transactionRes = await axios.get(`${Env.get('MARKETPLACE_CORE')}transaction/number/${encodeURIComponent(transactionNumber)}`)
            const transactionPayload = transactionRes?.data || {}
            const transaction = transactionPayload.data

            if (!transactionPayload.success || !transaction) {
                return response.status(404).json({
                    status: false,
                    message: transactionPayload.error || transactionPayload.message || 'Transaksi tidak ditemukan'
                })
            }

            if (!isTransactionOwnedByMember(transaction, auth.user)) {
                return response.status(403).json({
                    status: false,
                    message: 'Transaksi bukan milik member'
                })
            }

            const transactionReference = ProductReviewEligibility.extractTransactionReference(transaction, req)
            const targetTransactionNumber = transactionReference.transaction_number || transactionNumber
            const api = `${Env.get('MARKETPLACE_CORE')}transaction/number/${encodeURIComponent(targetTransactionNumber)}/complete`
            const res = await axios.put(api, {})
            const payload = res?.data || {}

            if (payload.success) {
                const decoratedTransactions = await ProductReviewEligibility.appendReviewEligibilityToTransactions(
                    [payload.data],
                    auth.user.member_id
                )

                return response.json({
                    status: true,
                    message: payload.success,
                    data: decoratedTransactions[0] || payload.data
                })
            }

            return response.json({
                status: false,
                message: payload.error || payload.message || 'Gagal menyelesaikan transaksi',
                data: payload.data || null
            })
        } catch (error) {
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async complain({request, response, auth}){
        const req = request.all()
        const transactionNumber = req.transaction_number || req.transaction_no || req.number

        if (!transactionNumber) {
            return response.badRequest({
                status: false,
                message: 'transaction_number wajib diisi'
            })
        }

        try {
            const transaction = await ProductReviewEligibility.findMemberTransaction({
                email: auth.user.email,
                transactionNumber
            })

            if (!transaction) {
                return response.status(404).json({
                    status: false,
                    message: 'Transaksi tidak ditemukan'
                })
            }

            const transactionReference = ProductReviewEligibility.extractTransactionReference(transaction, req)
            const targetTransactionNumber = transactionReference.transaction_number || transactionNumber
            const api = `${Env.get('MARKETPLACE_CORE')}transaction/number/${encodeURIComponent(targetTransactionNumber)}/complain`
            const res = await axios.put(api, {
                complain_note: req.complain_note || null
            })
            const payload = res?.data || {}

            if (payload.success) {
                return response.json({
                    status: true,
                    message: payload.success,
                    data: payload.data
                })
            }

            return response.json({
                status: false,
                message: payload.error || payload.message || 'Gagal mengirim complain transaksi',
                data: payload.data || null
            })
        } catch (error) {
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async create({request, response, auth}){
        const req = request.all()
        const normalizeDeliveryNote = (value) => {
            const normalized = `${value || ''}`.trim()
            return normalized ? normalized.slice(0, 255) : null
        }
        const transactionDeliveryNote = normalizeDeliveryNote(req.transaction_delivery_note)
        let cashier_id
        const partner = await Partner.query().where('partner_id',auth.user.default_partner_id).first()
        const marketplaceCore = Env.get('MARKETPLACE_CORE')
        const nMarketplaceCore = Env.get('NMARKETPLACE') || marketplaceCore
        const defaultCompanySlug = Env.get('DEFAULT_COMPANY_SLUG')

        if(!partner) {
            return response.json({
                status: false,
                message: 'invalid partner_id'
            })
        }

        const memberAddress = await Address.query()
            .where('member_id', auth.user.member_id)
            .first()

        if (!memberAddress) {
            return response.json({
                status: false,
                message: 'Lengkapi alamat pengiriman terlebih dahulu'
            })
        }

        const resolveCompanySlugFromStore = async (storeSlug) => {
            if (!storeSlug) {
                return null
            }

            try {
                const storeApi = `${nMarketplaceCore}store/slug/${storeSlug}`
                const storeRes = await axios.get(storeApi)

                if (storeRes?.data?.error) {
                    return null
                }

                const storePayload = storeRes?.data?.data || storeRes?.data
                const storeData = Array.isArray(storePayload) ? storePayload[0] : storePayload

                return storeData?.company_slug || storeData?.company?.company_slug || null
            } catch (error) {
                return null
            }
        }

        const storeSlug = req.store_slug || partner.store_slug
        const companySlugFromStore = await resolveCompanySlugFromStore(storeSlug)

        const checkoutCompanySlug = companySlugFromStore || req.company_slug || defaultCompanySlug || partner.company_slug
        const companySlugs = [...new Set([
            checkoutCompanySlug,
            req.company_slug,
            defaultCompanySlug,
            partner.company_slug
        ].filter(Boolean))]

        if (companySlugs.length === 0) {
            return response.json({
                status: false,
                message: 'company_slug is required'
            })
        }

        const voucherValidation = await this.validateVoucherCompany({
            voucherCode: req.voucher_code,
            checkoutCompanySlug,
            memberId: auth.user.member_id,
            items: req.item || []
        })

        if (!voucherValidation.status) {
            return response.json({
                status: false,
                message: voucherValidation.message
            })
        }

        let cashierErrorMessage = 'Company not found'
        for (const companySlug of companySlugs) {
            const api = `${marketplaceCore}company/slug/${companySlug}/cashier`
            try {
                const cashier = await axios.get(api)
                if (cashier?.data?.success && cashier?.data?.data?.length > 0) {
                    cashier_id = cashier.data.data[0].cashier_id
                    break
                }

                cashierErrorMessage = cashier?.data?.error || 'invalid cashier id'
            } catch (error) {
                cashierErrorMessage = error.message
            }
        }

        if (!cashier_id) {
            return response.json({
                status: false,
                message: cashierErrorMessage
            })
        }

        try {
            const params = {
                item: req.item,
                store_id: req.store_id,
                store_slug: storeSlug,
                company_slug: checkoutCompanySlug,
                voucher_code: req.voucher_code,
                ms_payment_id: Env.get('MARKETPLACE_CORE_PAYMENT_ID') || Env.get('MS_PAYMENT_ID') || 4,
                ms_delivery_id: req.ms_delivery_id,
                preview_fee: req.preview_fee,
                customer_name:`${auth.user.firstname?auth.user.firstname:'John'} ${auth.user.lastname?' '+auth.user.lastname:'Doe'}`,
                customer_msisdn: auth.user.phone,
                customer_email: auth.user.email,
                cashier_id: cashier_id,
                shipping_destination: req.shipping_destination,
                shipping_destination_name: req.shipping_destination_name,
                shipping_destination_address: req.shipping_destination_address,
                shipping_destination_coordinate: req.shipping_destination_coordinate,
                shipping_service: req.shipping_service,
                pickup_date: req.pickup_date,
                transaction_url_referer: Env.get('APP_URL')
            }
            if(transactionDeliveryNote){
                params.transaction_delivery_note = transactionDeliveryNote
            }
            if(req.voucher_code){
                params.voucher_type = "loyalty"
            }
            // return response.json(params)
            console.log("params",params)
            const res = await axios.post(Env.get('MARKETPLACE_CORE')+'transaction/retail/order',params)
            if(req.preview_fee){
                return response.json(res.data)
            }else{
                if(res.data.success){
                    // catat disini
                    const transaction = new Transaction()
                    transaction.member_id = auth.user.member_id
                    transaction.request = JSON.stringify(params)
                    transaction.response = JSON.stringify(res.data)
                    transaction.url = Env.get('MARKETPLACE_CORE')+'transaction/retail/order'
                    await transaction.save()
                    return response.json({
                        status: true,
                        data: res.data.data,
                        token: res.data.token
                    })
                }else{
    
                    return response.json({
                        status: false,
                        message: res.data.error
                    })
                }

                
            }

            
        } catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
        }
    }

    async resume({request, response, json}) {
        const req = request.all()
        
        try {
            const params = req
            const api = `${Env.get('MARKETPLACE_CORE')}transaction/retail/resume`
            // return api
            const res = await axios.put(api,req)
            // return response.json(res.data)

            if(res.data.success){
                // return res.data
                return response.json({
                    status: true,
                    data: res.data
                })
            }else{
                return response.json({
                    status: false,
                    data: res.data
                })
            }

        } catch (error) {
            response.data({
                status: false,
                message: error.message
            })
        }
    }

}

module.exports = TransactionController
