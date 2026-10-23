'use strict'
const Model = use('Model')
class NotificationDelivery extends Model {
    static get table () { return 'notification_deliveries' }
    static get primaryKey () { return 'notification_delivery_id' }
}
module.exports = NotificationDelivery
