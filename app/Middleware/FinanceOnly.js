'use strict'

class FinanceOnly {
    async handle ({ auth, response }, next) {
        if (!auth.user || !['admin', 'finance'].includes(auth.user.type)) {
            return response.status(403).json({ status: false, code: 'FINANCE_PERMISSION_REQUIRED', message: 'Akses finance diperlukan.' })
        }
        await next()
    }
}
module.exports = FinanceOnly
