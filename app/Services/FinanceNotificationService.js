'use strict'

const User = use('App/Models/User')
const NotificationDelivery = use('App/Models/NotificationDelivery')
const Email = use('App/Lib/Email')

class FinanceNotificationService {
    async queueWithdrawal (withdrawal) {
        const recipients = await User.query().where('type', 'finance').where('status', 'active').whereNotNull('email').fetch()
        const created = []
        for (const user of recipients.toJSON()) {
            const key = `withdrawal-created:${withdrawal.withdrawal_id}:${user.user_id}`
            let delivery = await NotificationDelivery.query().where('deduplication_key', key).first()
            if (!delivery) {
                delivery = new NotificationDelivery()
                Object.assign(delivery, { notification_type: 'withdrawal_created', reference_type: 'withdrawal', reference_id: String(withdrawal.withdrawal_id), recipient_user_id: user.user_id, recipient_email: user.email, status: 'pending', deduplication_key: key })
                await delivery.save()
            }
            created.push(delivery)
        }
        return created
    }

    async sendPending (limit = 50) {
        const deliveries = await NotificationDelivery.query().whereIn('status', ['pending', 'failed']).orderBy('notification_delivery_id', 'asc').limit(limit).fetch()
        for (const delivery of deliveries.toJSON()) await this.send(delivery.notification_delivery_id)
    }

    async send (id) {
        const delivery = await NotificationDelivery.query().where('notification_delivery_id', id).first()
        if (!delivery || delivery.status === 'sent') return delivery ? delivery.toJSON() : null
        try {
            const withdrawal = await use('App/Models/Withdrawal').query().where('withdrawal_id', delivery.reference_id).first()
            if (!withdrawal) throw new Error('Withdrawal tidak ditemukan')
            await Email.send({ email: delivery.recipient_email, subject: `Withdrawal baru ${withdrawal.withdrawal_number}`, message: `Ada pengajuan withdrawal baru ${withdrawal.withdrawal_number}. Nominal Rp ${withdrawal.amount}, tujuan ${withdrawal.channel} ${withdrawal.account_number_masked}. Silakan proses melalui CMS Finance.` })
            delivery.status = 'sent'; delivery.sent_at = new Date(); delivery.attempt_count = Number(delivery.attempt_count || 0) + 1; delivery.last_error = null; await delivery.save()
        } catch (error) {
            delivery.status = 'failed'; delivery.attempt_count = Number(delivery.attempt_count || 0) + 1; delivery.last_error = String(error.message || error).slice(0, 1000); await delivery.save()
        }
        return delivery.toJSON()
    }
}
module.exports = new FinanceNotificationService()
