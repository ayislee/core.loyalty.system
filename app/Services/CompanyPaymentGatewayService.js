'use strict'

const axios = use('axios')
const Env = use('Env')
const MemberPartner = use('App/Models/MemberPartner')

class PaymentGatewayError extends Error {
    constructor (code, message, status = 422, data = null) {
        super(message)
        this.code = code
        this.status = status
        this.data = data
    }
}

class CompanyPaymentGatewayService {
    static get Error () { return PaymentGatewayError }

    normalizeIdentifier (value) {
        return `${value || ''}`.trim().toUpperCase()
    }

    unwrap (payload) {
        if (!payload || typeof payload !== 'object') return payload
        return payload.data && typeof payload.data === 'object' ? payload.data : payload
    }

    isConfiguredAndActive (gateway) {
        return Boolean(gateway && gateway.configured === true && gateway.active === true)
    }

    publicGateway (gateway) {
        return {
            identifier: gateway.identifier,
            configuration_source: gateway.configuration_source,
            configured: Boolean(gateway.configured),
            active: Boolean(gateway.active),
            public_configuration: gateway.public_configuration || {}
        }
    }

    resolveFromCompany (company) {
        if (!company || typeof company !== 'object') {
            throw new PaymentGatewayError('PAYMENT_GATEWAY_UNAVAILABLE', 'Konfigurasi company untuk payment gateway tidak tersedia.')
        }

        const selectedIdentifier = this.normalizeIdentifier(company.ms_payment_identifier)
        if (selectedIdentifier) {
            const configuration = company.company_ms_payment_identifier
            const configuredIdentifier = this.normalizeIdentifier(configuration && configuration.ms_payment_identifier)
            if (configuredIdentifier !== selectedIdentifier || !this.isConfiguredAndActive(configuration)) {
                throw new PaymentGatewayError('PAYMENT_GATEWAY_UNAVAILABLE', 'Payment gateway default company belum aktif atau belum lengkap.')
            }
            return this.publicGateway({
                identifier: selectedIdentifier,
                configuration_source: 'COMPANY',
                configured: configuration.configured,
                active: configuration.active,
                public_configuration: configuration.public_configuration || {}
            })
        }

        const fallback = company.payment_gateway_fallback
        const fallbackIdentifier = this.normalizeIdentifier(fallback && (fallback.identifier || fallback.ms_payment_identifier))
        if (fallbackIdentifier && fallback.configured !== false && fallback.active !== false) {
            return this.publicGateway({
                identifier: fallbackIdentifier,
                configuration_source: 'ENV_FALLBACK',
                configured: true,
                active: true,
                public_configuration: fallback.public_configuration || {}
            })
        }

        throw new PaymentGatewayError('PAYMENT_GATEWAY_UNAVAILABLE', 'Payment gateway default company belum tersedia.')
    }

    async partnerForMember (member, requestedPartnerId = null) {
        const partnerId = requestedPartnerId || member.default_partner_id
        if (partnerId) {
            const memberPartner = await MemberPartner.query()
                .where('member_id', member.member_id)
                .where('partner_id', partnerId)
                .with('partner')
                .first()
            if (!memberPartner) throw new PaymentGatewayError('PARTNER_NOT_FOUND', 'Partner member tidak ditemukan.', 404)
            const data = memberPartner.toJSON()
            if (!data.partner || !data.partner.company_slug) throw new PaymentGatewayError('PAYMENT_GATEWAY_UNAVAILABLE', 'Company partner belum dikonfigurasi.', 422)
            return { partner_id: data.partner_id, company_slug: data.partner.company_slug }
        }

        const fallbackCompanySlug = Env.get('DEFAULT_COMPANY_SLUG')
        if (fallbackCompanySlug) return { partner_id: null, company_slug: fallbackCompanySlug }
        throw new PaymentGatewayError('PARTNER_NOT_FOUND', 'Partner default member tidak ditemukan.', 404)
    }

    async storesForCompany (companySlug) {
        let response
        try {
            response = await axios.get(`${Env.get('MARKETPLACE_CORE')}company/slug/${encodeURIComponent(companySlug)}/store`)
        } catch (error) {
            throw new PaymentGatewayError('MARKETPLACE_UPSTREAM_ERROR', 'Gagal membaca konfigurasi payment gateway marketplace.', 502)
        }
        if (response?.data?.error || response?.data?.success === false) {
            throw new PaymentGatewayError('MARKETPLACE_UPSTREAM_ERROR', response?.data?.error || 'Gagal membaca konfigurasi payment gateway marketplace.', 502)
        }
        const data = this.unwrap(response.data)
        const stores = Array.isArray(data) ? data : (Array.isArray(data && data.stores) ? data.stores : [])
        if (!stores.length) throw new PaymentGatewayError('PAYMENT_GATEWAY_UNAVAILABLE', 'Toko company tidak tersedia.', 422)
        return stores
    }

    async masterPayment (identifier) {
        let response
        try {
            response = await axios.get(`${Env.get('MARKETPLACE_CORE')}list/ms_payment`, {
                params: { ms_payment_identifier: identifier }
            })
        } catch (error) {
            throw new PaymentGatewayError('MARKETPLACE_UPSTREAM_ERROR', 'Gagal membaca master payment marketplace.', 502)
        }
        const payments = Array.isArray(response?.data?.data) ? response.data.data : []
        const payment = payments.find((entry) => this.normalizeIdentifier(entry.ms_payment_identifier) === identifier)
        if (!payment) throw new PaymentGatewayError('PAYMENT_GATEWAY_UNAVAILABLE', `Master payment ${identifier} tidak tersedia.`)
        return payment
    }

    async resolveForMember ({ member, partnerId = null }) {
        const partner = await this.partnerForMember(member, partnerId)
        const stores = await this.storesForCompany(partner.company_slug)
        const company = stores.find((store) => store && store.company)?.company || null
        const gateway = this.resolveFromCompany(company)
        const payment = await this.masterPayment(gateway.identifier)
        return {
            ...gateway,
            ms_payment_id: payment.ms_payment_id,
            ms_payment_name: payment.ms_payment_name,
            company_id: company.company_id || null,
            company_slug: company.company_slug || partner.company_slug,
            partner_id: partner.partner_id
        }
    }

    attachToStores (stores) {
        return (Array.isArray(stores) ? stores : []).map((store) => {
            try {
                return { ...store, effective_payment_gateway: this.resolveFromCompany(store.company) }
            } catch (error) {
                return {
                    ...store,
                    effective_payment_gateway: {
                        identifier: null,
                        configuration_source: null,
                        configured: false,
                        active: false,
                        public_configuration: {},
                        error_code: error.code || 'PAYMENT_GATEWAY_UNAVAILABLE'
                    }
                }
            }
        })
    }
}

module.exports = new CompanyPaymentGatewayService()
