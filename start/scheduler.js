'use strict'

const VoucherRedeemConfirmation = use('App/Lib/VoucherRedeemConfirmation')
const Env = use('Env')
const WalletHold = use('App/Models/WalletHold')
const WalletService = use('App/Services/WalletService')
const FinanceNotificationService = use('App/Services/FinanceNotificationService')

let releasingExpiredVoucherRedeems = false

const releaseExpiredVoucherRedeems = async () => {
    if (releasingExpiredVoucherRedeems) {
        return
    }

    releasingExpiredVoucherRedeems = true
    try {
        await VoucherRedeemConfirmation.releaseExpiredHolds()
    } catch (error) {
        console.log(error)
    } finally {
        releasingExpiredVoucherRedeems = false
    }
}

releaseExpiredVoucherRedeems()
setInterval(releaseExpiredVoucherRedeems, 60 * 1000)

let processingWalletJobs = false
const processWalletJobs = async () => {
    if (processingWalletJobs) return
    processingWalletJobs = true
    try {
        await FinanceNotificationService.sendPending(50)
        // Disabled by default: enable only after Marketplace Core status reconciliation is deployed.
        if (`${Env.get('WALLET_EXPIRE_HOLDS_ENABLED', 'false')}`.toLowerCase() === 'true') {
            const expired = await WalletHold.query().where('status', 'active').whereNotNull('expires_at').where('expires_at', '<=', new Date()).limit(100).fetch()
            for (const hold of expired.toJSON()) await WalletService.expireHold({ hold_id: hold.wallet_hold_id, idempotency_key: `wallet-expire:${hold.wallet_hold_id}`, reason: 'Hold checkout kedaluwarsa' })
        }
    } catch (error) { console.log('[wallet-scheduler]', error.message || error) } finally { processingWalletJobs = false }
}
processWalletJobs()
setInterval(processWalletJobs, 60 * 1000)
