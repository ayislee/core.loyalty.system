'use strict'

const Env = use('Env')
const Hash = use('Hash')
const View = use('View')
const moment = use('moment')
const uuid = use('uuid')

const VoucherRedeemConfirmation = use('App/Models/VoucherRedeemConfirmation')
const Voucher = use('App/Models/Voucher')
const Point = use('App/Models/Point')
const PointHistory = use('App/Models/PointHistory')
const MemberVoucher = use('App/Models/MemberVoucher')
const WhatsappAPI = use('App/Lib/WhatsappAPI')
const BasicEmailService = use('App/Lib/BasicEmailService')

const TOKEN_VALID_MINUTES = 5

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== ''

class VoucherRedeemConfirmationService {
    getChannels(member) {
        const channels = []

        if (hasValue(member.phone)) {
            channels.push('whatsapp')
        }

        if (hasValue(member.email)) {
            channels.push('email')
        }

        return channels
    }

    getExpiresInSeconds(validUntil) {
        const seconds = moment(validUntil).diff(moment(), 'seconds')
        return seconds > 0 ? seconds : 0
    }

    async sendToken({ member, voucher, token, channels }) {
        const message = `SANGAT RAHASIA! Token konfirmasi penukaran voucher ${voucher.name} adalah ${token}. Token berlaku ${TOKEN_VALID_MINUTES} menit. Jangan bagikan token ini kepada pihak lain.`

        if (channels.includes('whatsapp')) {
            await WhatsappAPI.send({
                phone: member.phone,
                message: message
            })
        }

        if (channels.includes('email')) {
            const emailResponse = await BasicEmailService.SendMail({
                from: Env.get('EMAIL_SENDER'),
                to: member.email,
                bcc: null,
                cc: null,
                subject: 'Token Konfirmasi Penukaran Voucher',
                contentHTML: View.render('mail/voucher_redeem_token', {
                    token: token,
                    voucher_name: voucher.name,
                    valid_minutes: TOKEN_VALID_MINUTES
                })
            })

            if (!emailResponse || !emailResponse.status) {
                throw new Error(emailResponse ? emailResponse.message : 'Failed to send email')
            }
        }
    }

    async releaseHold(confirmation, status = 'expired') {
        if (!confirmation || confirmation.status !== 'pending' || confirmation.released_at) {
            return confirmation
        }

        if (confirmation.point_history_id) {
            const voucher = await Voucher.query()
                .where('voucher_id', confirmation.voucher_id)
                .first()

            const pointHistory = new PointHistory()
            pointHistory.member_id = confirmation.member_id
            pointHistory.ref_id = uuid.v4()
            pointHistory.point = parseFloat(confirmation.point)
            pointHistory.desc = `Release hold redeem ${voucher ? voucher.name : 'voucher'}`
            if (voucher && voucher.partner_id) {
                pointHistory.partner_id = voucher.partner_id
            }
            await pointHistory.save()
        }

        confirmation.status = status
        confirmation.released_at = moment().format('YYYY-MM-DD HH:mm:ss')
        await confirmation.save()

        return confirmation
    }

    async releaseExpiredHolds(memberId = null) {
        const query = VoucherRedeemConfirmation.query()
            .where('status', 'pending')
            .where('token_valid_until', '<=', moment().format('YYYY-MM-DD HH:mm:ss'))

        if (memberId) {
            query.where('member_id', memberId)
        }

        const confirmations = await query.fetch()

        for (const confirmation of confirmations.rows) {
            await this.releaseHold(confirmation, 'expired')
        }

        return confirmations.rows.length
    }

    async getActiveConfirmation(memberId, voucherId) {
        return VoucherRedeemConfirmation.query()
            .where('member_id', memberId)
            .where('voucher_id', voucherId)
            .where('status', 'pending')
            .where('token_valid_until', '>', moment().format('YYYY-MM-DD HH:mm:ss'))
            .first()
    }

    async createRequest(member, voucher) {
        await this.releaseExpiredHolds(member.member_id)

        const activeConfirmation = await this.getActiveConfirmation(member.member_id, voucher.voucher_id)
        if (activeConfirmation) {
            return {
                status: true,
                already_active: true,
                confirmation: activeConfirmation
            }
        }

        const point = await Point.query()
            .where('member_id', member.member_id)
            .first()

        if (!point || parseFloat(point.point) < parseFloat(voucher.number_point)) {
            return {
                status: false,
                message: 'Poin Anda tidak cukup'
            }
        }

        const channels = this.getChannels(member)
        if (channels.length === 0) {
            return {
                status: false,
                message: 'Lengkapi nomor WhatsApp atau email di profile terlebih dahulu'
            }
        }

        const token = Math.floor(Math.random() * (999999 - 100000 + 1)) + 100000
        const tokenString = token.toString()
        const validUntil = moment().add(TOKEN_VALID_MINUTES, 'minutes').format('YYYY-MM-DD HH:mm:ss')

        const confirmation = new VoucherRedeemConfirmation()
        confirmation.member_id = member.member_id
        confirmation.voucher_id = voucher.voucher_id
        confirmation.token_hash = await Hash.make(tokenString)
        confirmation.channels = channels.join(',')
        confirmation.point = voucher.number_point
        confirmation.status = 'pending'
        confirmation.token_valid_until = validUntil
        await confirmation.save()

        const holdHistory = new PointHistory()
        holdHistory.member_id = member.member_id
        holdHistory.ref_id = uuid.v4()
        holdHistory.point = 0 - parseFloat(voucher.number_point)
        holdHistory.desc = `Hold redeem ${voucher.name}`
        if (voucher.partner_id) {
            holdHistory.partner_id = voucher.partner_id
        }
        await holdHistory.save()

        confirmation.point_history_id = holdHistory.point_history_id
        await confirmation.save()

        try {
            await this.sendToken({
                member: member,
                voucher: voucher,
                token: tokenString,
                channels: channels
            })
        } catch (error) {
            console.log(error)
            await this.releaseHold(confirmation, 'cancelled')
            return {
                status: false,
                message: 'Gagal mengirim token konfirmasi'
            }
        }

        return {
            status: true,
            already_active: false,
            confirmation: confirmation
        }
    }

    async verify({ memberId, confirmationId, token }) {
        await this.releaseExpiredHolds(memberId)

        const confirmation = await VoucherRedeemConfirmation.query()
            .where('voucher_redeem_confirmation_id', confirmationId)
            .where('member_id', memberId)
            .first()

        if (!confirmation) {
            return {
                status: false,
                message: 'Permintaan penukaran tidak ditemukan'
            }
        }

        if (confirmation.status === 'confirmed') {
            return {
                status: false,
                message: 'Token sudah digunakan'
            }
        }

        if (confirmation.status !== 'pending') {
            return {
                status: false,
                message: 'Token sudah kedaluwarsa'
            }
        }

        if (moment(confirmation.token_valid_until).isSameOrBefore(moment())) {
            await this.releaseHold(confirmation, 'expired')
            return {
                status: false,
                message: 'Token sudah kedaluwarsa'
            }
        }

        if (!String(token || '').match(/^\d{6}$/)) {
            return {
                status: false,
                message: 'Token harus berupa 6 digit angka'
            }
        }

        const validToken = await Hash.verify(String(token), confirmation.token_hash)
        if (!validToken) {
            return {
                status: false,
                message: 'Token tidak valid'
            }
        }

        const voucher = await Voucher.query()
            .where('status', 'active')
            .where('voucher_id', confirmation.voucher_id)
            .first()

        if (!voucher) {
            await this.releaseHold(confirmation, 'cancelled')
            return {
                status: false,
                message: 'Voucher tidak valid'
            }
        }

        try {
            const memberVoucher = new MemberVoucher()
            memberVoucher.member_id = confirmation.member_id
            memberVoucher.voucher_id = confirmation.voucher_id
            memberVoucher.voucher_code = uuid.v4()
            memberVoucher.expire_date = moment().add(voucher.duration, 'days').format('YYYY-MM-DD HH:mm:ss')
            memberVoucher.amount = parseFloat(Env.get('POINT') ? Env.get('POINT') : 1000) * parseFloat(voucher.number_point)
            await memberVoucher.save()

            confirmation.status = 'confirmed'
            confirmation.confirmed_at = moment().format('YYYY-MM-DD HH:mm:ss')
            confirmation.member_voucher_id = memberVoucher.member_voucher_id
            await confirmation.save()

            return {
                status: true,
                message: 'Voucher berhasil ditukar',
                data: memberVoucher
            }
        } catch (error) {
            console.log(error)
            await this.releaseHold(confirmation, 'cancelled')
            return {
                status: false,
                message: 'Gagal menukar voucher'
            }
        }
    }
}

module.exports = new VoucherRedeemConfirmationService()
