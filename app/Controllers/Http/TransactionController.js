'use strict'
const axios = use('axios')
const Env = use('Env')
const Transaction = use('App/Models/Transaction')
const Partner = use('App/Models/Partner')
const Address = use('App/Models/Address')
const ProductReviewEligibility = use('App/Helpers/ProductReviewEligibility')
const qs = use('qs')

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
    async list({request, response, auth}){
        const req = request.all()
        const params = qs.stringify(req)
        // return response.json(params)
        try {
            const res = await axios.get(Env.get('MARKETPLACE_CORE')+`transaction/email/${auth.user.email}?${params}`)
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
                transaction = await ProductReviewEligibility.findMemberTransaction({
                    email: auth.user.email,
                    transactionNumber
                })
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

    async create({request, response, auth}){
        const req = request.all()
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

        const companySlugs = [...new Set([
            req.company_slug,
            partner.company_slug,
            defaultCompanySlug,
            companySlugFromStore
        ].filter(Boolean))]

        if (companySlugs.length === 0) {
            return response.json({
                status: false,
                message: 'company_slug is required'
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
