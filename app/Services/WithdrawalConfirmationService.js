'use strict'

const crypto = require('crypto')
const Hash = use('Hash')
const Env = use('Env')
const moment = use('moment')
const WithdrawalConfirmation = use('App/Models/WithdrawalConfirmation')
const WithdrawalService = use('App/Services/WithdrawalService')
const WhatsappAPI = use('App/Lib/WhatsappAPI')
const Email = use('App/Lib/Email')
const MemberStoreService = use('App/Services/MemberStoreService')

class WithdrawalConfirmationService {
    key () { return crypto.createHash('sha256').update(String(Env.get('WALLET_ENCRYPTION_KEY') || Env.get('APP_KEY') || 'wallet-development-key')).digest() }
    encrypt (value) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv); const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]); return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}` }
    decrypt (value) { const [iv, tag, encrypted] = String(value).split(':'); const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64')); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8')) }
    validityMinutes () { return Math.max(1, Number(Env.get('WITHDRAWAL_CONFIRMATION_TOKEN_VALIDITY_MINUTES', Env.get('TOKEN_VALIDITY_PERIODE', 5))) || 5) }
    token () { return `${crypto.randomInt(100000, 1000000)}` }
    async supportPhone () {
        const configured = `${Env.get('WITHDRAWAL_SUPPORT_PHONE') || ''}`.trim()
        if (configured) return configured
        try {
            const resolved = await Promise.race([
                MemberStoreService.resolve(null, Env.get('DEFAULT_COMPANY_SLUG')),
                new Promise(resolve => setTimeout(() => resolve(null), 2000))
            ])
            const store = resolved?.store || {}
            return `${store.store_phone || store.phone || store.msisdn || store.store_msisdn || ''}`.trim()
        } catch (error) { return '' }
    }
    async notifyStore (withdrawal = {}) {
        const phone = await this.supportPhone()
        if (!phone) {
            console.log('[withdrawal-notification] store phone is unavailable', { withdrawal_id: withdrawal.withdrawal_id })
            return { skipped: 'STORE_PHONE_UNAVAILABLE' }
        }
        const amount = Number(withdrawal.amount || 0).toLocaleString('id-ID')
        const message = `🔔 PENGAJUAN PENARIKAN SALDO BARU\n\n🧾 No. Withdrawal: ${withdrawal.withdrawal_number}\n💰 Nominal: Rp${amount}\n🏦 Tujuan: ${withdrawal.channel} ${withdrawal.account_number_masked}\n👤 Atas Nama: ${withdrawal.account_holder_name_masked || 'Terlindungi'}\n\nStatus: Menunggu peninjauan. Mohon proses pengajuan melalui CMS Finance.`
        await WhatsappAPI.send({ phone, message })
        return { sent: true }
    }
    async request ({ member, payload }) {
        WithdrawalService.validatePayload(payload)
        if (!member?.phone) throw new WithdrawalService.Error('WITHDRAWAL_PHONE_REQUIRED', 'Nomor WhatsApp belum tersedia. Lengkapi nomor telepon terlebih dahulu.')
        const clientRequestId = String(payload.client_request_id || '')
        const code = this.token()
        const validUntil = moment().add(this.validityMinutes(), 'minutes').format('YYYY-MM-DD HH:mm:ss')
        let confirmation = await WithdrawalConfirmation.query().where('member_id', member.member_id).where('client_request_id', clientRequestId).first()
        if (!confirmation) confirmation = new WithdrawalConfirmation()
        confirmation.member_id = member.member_id
        confirmation.client_request_id = clientRequestId
        confirmation.payload_encrypted = this.encrypt(payload)
        confirmation.token = await Hash.make(code)
        confirmation.token_valid_until = validUntil
        confirmation.status = 'pending'
        await confirmation.save()
        const amount = Number(payload.amount || 0).toLocaleString('id-ID')
        const account = String(payload.account_number || '').replace(/\s/g, '')
        const holder = String(payload.account_holder_name || '').trim()
        const supportPhone = await this.supportPhone()
        const contact = supportPhone ? `\nHubungi ${supportPhone} apabila Anda tidak mengajukan penarikan ini.` : ''
        const message = `SANGAT RAHASIA! Kode konfirmasi penarikan saldo Anda sebesar Rp${amount} ke rekening ${account} atas nama ${holder} adalah ${code}. Kode berlaku ${this.validityMinutes()} menit. Jangan berikan kode ini kepada siapa pun.${contact}`
        const channels = ['whatsapp']
        try {
            await WhatsappAPI.send({ phone: member.phone, message })
        } catch (error) {
            confirmation.status = 'cancelled'
            await confirmation.save()
            throw new WithdrawalService.Error('WITHDRAWAL_TOKEN_DELIVERY_FAILED', 'Token WhatsApp gagal dikirim. Silakan coba lagi.', 502)
        }
        if (member.email && `${member.verified_email}` === '1') {
            channels.push('email')
            setImmediate(async () => {
                try { await Email.send({ email: member.email, subject: 'Token Konfirmasi Penarikan Saldo', message }) } catch (error) {
                    console.log('[withdrawal-confirmation] email token delivery failed', { member_id: member.member_id, message: error.message })
                }
            })
        }
        return { confirmation_id: confirmation.withdrawal_confirmation_id, token_valid_until: validUntil, channels }
    }
    async confirm ({ memberId, confirmationId, token }) {
        const confirmation = await WithdrawalConfirmation.query().where('withdrawal_confirmation_id', confirmationId).where('member_id', memberId).first()
        if (!confirmation) throw new WithdrawalService.Error('WITHDRAWAL_CONFIRMATION_NOT_FOUND', 'Permintaan konfirmasi withdrawal tidak ditemukan.', 404)
        if (confirmation.status === 'verified') throw new WithdrawalService.Error('WITHDRAWAL_CONFIRMATION_USED', 'Token withdrawal sudah digunakan.', 409)
        if (confirmation.status !== 'pending' || moment(confirmation.token_valid_until).isSameOrBefore(moment())) { confirmation.status = 'expired'; await confirmation.save(); throw new WithdrawalService.Error('WITHDRAWAL_TOKEN_EXPIRED', 'Token withdrawal telah kedaluwarsa.') }
        if (!await Hash.verify(String(token || ''), confirmation.token)) throw new WithdrawalService.Error('WITHDRAWAL_TOKEN_INVALID', 'Token withdrawal tidak valid.')
        const payload = this.decrypt(confirmation.payload_encrypted)
        const result = await WithdrawalService.create(memberId, payload)
        confirmation.status = 'verified'
        await confirmation.save()
        return result
    }
}

module.exports = new WithdrawalConfirmationService()
