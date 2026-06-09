'use strict'

const VoucherRedeemConfirmation = use('App/Lib/VoucherRedeemConfirmation')

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
