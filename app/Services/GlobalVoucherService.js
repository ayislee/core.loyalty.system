'use strict'

const Voucher = use('App/Models/Voucher')
const moment = use('moment')

class GlobalVoucherService {
    now () {
        return moment().format('YYYY-MM-DD HH:mm:ss')
    }

    normalizeCompanySlug (value) {
        return String(value || '').trim().toLowerCase()
    }

    matchesItems (voucher, items = []) {
        const sku = String(voucher.sku || '').trim().toLowerCase()
        if (!sku) return true
        return items.some((item) => [item.item_sku, item.sku, item.item_code, item.item_name]
            .some((value) => String(value || '').trim().toLowerCase() === sku))
    }

    async findEligible ({ voucherId, companySlug, items = [] }) {
        const normalizedCompanySlug = this.normalizeCompanySlug(companySlug)
        if (!normalizedCompanySlug) return { status: false, message: 'company_slug is required' }

        const voucher = await Voucher.query()
            .where('voucher_id', voucherId)
            .where('category', 'global')
            .where('status', 'active')
            .where('global_start_date', '<=', this.now())
            .where('global_end_date', '>=', this.now())
            .with('partner')
            .first()

        if (!voucher) return { status: false, message: 'Voucher global tidak tersedia atau sudah berakhir' }
        const data = voucher.toJSON()
        if (this.normalizeCompanySlug(data?.partner?.company_slug) !== normalizedCompanySlug) {
            return { status: false, message: 'Voucher global tidak berlaku untuk company ini' }
        }
        if (!this.matchesItems(data, items)) return { status: false, message: 'Voucher global tidak berlaku untuk produk yang dipilih' }
        return { status: true, data }
    }

    async listEligible ({ companySlug, items = [] }) {
        const normalizedCompanySlug = this.normalizeCompanySlug(companySlug)
        if (!normalizedCompanySlug) return []
        const vouchers = await Voucher.query()
            .where('category', 'global')
            .where('status', 'active')
            .where('global_start_date', '<=', this.now())
            .where('global_end_date', '>=', this.now())
            .with('partner')
            .fetch()
        return vouchers.toJSON().filter((voucher) =>
            this.normalizeCompanySlug(voucher?.partner?.company_slug) === normalizedCompanySlug &&
            this.matchesItems(voucher, items)
        )
    }
}

module.exports = new GlobalVoucherService()
