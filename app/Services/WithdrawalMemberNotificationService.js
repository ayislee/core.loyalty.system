'use strict'

const Member = use('App/Models/Member')
const WhatsappAPI = use('App/Lib/WhatsappAPI')
const Email = use('App/Lib/Email')

class WithdrawalMemberNotificationService {
    message (withdrawal = {}, status) {
        const amount = Number(withdrawal.net_amount || withdrawal.amount || 0).toLocaleString('id-ID')
        const number = withdrawal.withdrawal_number || `#${withdrawal.withdrawal_id}`
        if (status === 'approved') return `Pengajuan penarikan saldo ${number} sebesar Rp${amount} telah disetujui dan sedang diproses oleh Finance.`
        if (status === 'rejected') return `Pengajuan penarikan saldo ${number} sebesar Rp${amount} ditolak.${withdrawal.finance_note ? ` Alasan: ${withdrawal.finance_note}` : ''}`
        if (status === 'completed') return `Penarikan saldo ${number} sebesar Rp${amount} telah berhasil dibayarkan.${withdrawal.payment_reference ? ` Referensi pembayaran: ${withdrawal.payment_reference}.` : ''}`
        return null
    }

    async send ({ withdrawal, status }) {
        const message = this.message(withdrawal, status)
        if (!message) return { skipped: 'STATUS_NOT_NOTIFIABLE' }
        const member = await Member.query().where('member_id', withdrawal.member_id).first()
        if (!member) return { skipped: 'MEMBER_NOT_FOUND' }
        const data = member.toJSON ? member.toJSON() : member
        const tasks = []
        if (data.phone) tasks.push(WhatsappAPI.send({ phone: data.phone, message }))
        if (data.email && `${data.verified_email}` === '1') tasks.push(Email.send({ email: data.email, subject: 'Status Penarikan Saldo', message }))
        if (!tasks.length) return { skipped: 'MEMBER_CONTACT_UNAVAILABLE' }
        const settled = await Promise.allSettled(tasks)
        const failed = settled.filter(result => result.status === 'rejected')
        if (failed.length) console.log('[withdrawal-member-notification] delivery failed', { withdrawal_id: withdrawal.withdrawal_id, status, failed: failed.length })
        return { sent: settled.length - failed.length, failed: failed.length }
    }
}

module.exports = new WithdrawalMemberNotificationService()
