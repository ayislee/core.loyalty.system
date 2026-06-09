'use strict'

const MemberActivityHistory = use('App/Models/MemberActivityHistory')
const moment = use('moment')

const SENSITIVE_KEYS = [
    'authorization',
    'password',
    'token',
    'otp',
    'secret',
    'pin',
    'code'
]

const getHeader = (request, name) => {
    if (!request) return null

    if (typeof request.header === 'function') {
        return request.header(name)
    }

    const headers = typeof request.headers === 'function'
        ? request.headers()
        : {}

    return headers[name] || headers[name.toLowerCase()] || null
}

const normalizeIp = (ip) => {
    if (!ip) return null
    return `${ip}`.split(',')[0].trim().slice(0, 45) || null
}

const getIpAddress = (request) => {
    const forwardedFor = getHeader(request, 'x-forwarded-for')
    if (forwardedFor) return normalizeIp(forwardedFor)

    const realIp = getHeader(request, 'x-real-ip') || getHeader(request, 'cf-connecting-ip')
    if (realIp) return normalizeIp(realIp)

    if (request && typeof request.ip === 'function') {
        return normalizeIp(request.ip())
    }

    return normalizeIp(
        request?.request?.ip ||
        request?.request?.connection?.remoteAddress ||
        request?.request?.socket?.remoteAddress
    )
}

const sanitizeMetadata = (value) => {
    if (!value || typeof value !== 'object') return value

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeMetadata(item))
    }

    return Object.keys(value).reduce((result, key) => {
        const normalizedKey = `${key}`.toLowerCase()
        const isSensitive = SENSITIVE_KEYS.some((sensitiveKey) => normalizedKey.includes(sensitiveKey))

        result[key] = isSensitive ? '[redacted]' : sanitizeMetadata(value[key])
        return result
    }, {})
}

const stringifyMetadata = (metadata) => {
    if (!metadata) return null

    try {
        return JSON.stringify(sanitizeMetadata(metadata)).slice(0, 5000)
    } catch (error) {
        return null
    }
}

const record = async ({
    memberId,
    visitorId = null,
    activityType,
    request,
    description = null,
    metadata = null,
    dedupeSeconds = 0
}) => {
    if ((!memberId && !visitorId) || !activityType) return null

    try {
        const ipAddress = getIpAddress(request)
        const userAgent = getHeader(request, 'user-agent')
        const metadataText = stringifyMetadata(metadata)

        if (dedupeSeconds > 0) {
            const cutoff = moment()
                .subtract(dedupeSeconds, 'seconds')
                .format('YYYY-MM-DD HH:mm:ss')

            const duplicateQuery = MemberActivityHistory.query()
                .where('activity_type', activityType)
                .where('created_at', '>=', cutoff)

            if (memberId) {
                duplicateQuery.where('member_id', memberId)
            } else {
                duplicateQuery.whereNull('member_id')
            }

            if (visitorId) {
                duplicateQuery.where('visitor_id', visitorId)
            } else {
                duplicateQuery.whereNull('visitor_id')
            }

            if (description === null) {
                duplicateQuery.whereNull('description')
            } else {
                duplicateQuery.where('description', description)
            }

            if (metadataText === null) {
                duplicateQuery.whereNull('metadata')
            } else {
                duplicateQuery.where('metadata', metadataText)
            }

            const existingHistory = await duplicateQuery
                .orderBy('member_activity_history_id', 'desc')
                .first()

            if (existingHistory) return existingHistory
        }

        const history = new MemberActivityHistory()
        history.member_id = memberId || null
        history.visitor_id = visitorId || null
        history.activity_type = activityType
        history.ip_address = ipAddress
        history.user_agent = userAgent
        history.description = description
        history.metadata = metadataText

        await history.save()
        return history
    } catch (error) {
        console.log('[member-activity] failed to record history', error.message)
        return null
    }
}

module.exports = {
    record
}
