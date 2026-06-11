'use strict'

const axios = use('axios')
const Env = use('Env')
const ProductReview = use('App/Models/ProductReview')
const qs = use('qs')

// Status eligible review: transaksi sudah selesai.
const FINAL_APPROVAL_STATUSES = [
  'completed',
  'complete'
]

const normalizeStatus = (value) => `${value || ''}`
  .trim()
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')

const normalizeIdentifier = (value) => {
  if (value === null || value === undefined) return ''
  return `${value}`.trim()
}

const toSafeInteger = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : null
}

const pickFirstValue = (candidates) => {
  for (const value of candidates) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && value.trim() === '') continue
    return value
  }
  return null
}

const hasFinalStatus = (candidates, finalStatuses) => {
  return candidates.some((candidate) => {
    const normalized = normalizeStatus(candidate)
    if (!normalized) return false
    if (finalStatuses.includes(normalized)) return true
    return finalStatuses.some((status) => normalized.includes(status))
  })
}

const parsePayload = (payload) => {
  if (!payload) return {}
  if (typeof payload === 'object') return payload
  if (typeof payload !== 'string') return {}

  try {
    return JSON.parse(payload)
  } catch (error) {
    return {}
  }
}

const getTransactionRows = (payload) => {
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.data)) return payload.data.data
  if (Array.isArray(payload?.transactions)) return payload.transactions
  if (Array.isArray(payload)) return payload
  return []
}

const getLastPage = (payload, fallbackPage = 1) => {
  const candidates = [
    payload?.last_page,
    payload?.lastPage,
    payload?.data?.last_page,
    payload?.data?.lastPage
  ]

  for (const value of candidates) {
    const parsed = toSafeInteger(value)
    if (parsed !== null && parsed > 0) return parsed
  }

  return fallbackPage
}

const extractReviewItemId = (detail) => {
  const payload = parsePayload(detail?.transaction_detail_payload)
  return pickFirstValue([
    detail?.item_id,
    detail?.item?.item_id,
    detail?.product?.item_id,
    payload?.item_id,
    payload?.item?.item_id,
    payload?.product?.item_id,
    payload?.menu?.item_id,
    payload?.menu?.item?.item_id
  ])
}

const extractTransactionDetailId = (detail) => {
  return pickFirstValue([
    detail?.transaction_detail_id,
    detail?.id,
    detail?.detail_id
  ])
}

const extractTransactionReference = (transaction, requestBody = {}) => {
  return {
    transaction_id: pickFirstValue([
      requestBody?.transaction_id,
      transaction?.transaction_id,
      transaction?.id
    ]),
    transaction_number: pickFirstValue([
      requestBody?.transaction_number,
      transaction?.transaction_number,
      transaction?.transaction_no,
      transaction?.number
    ])
  }
}

const getTransactionDetailList = (transaction) => {
  return Array.isArray(transaction?.transaction_detail)
    ? transaction.transaction_detail
    : []
}

const findTransactionDetailByItemId = (transaction, itemId) => {
  const expectedItemId = normalizeIdentifier(itemId)
  if (!expectedItemId) return null

  return getTransactionDetailList(transaction).find((detail) => (
    normalizeIdentifier(extractReviewItemId(detail)) === expectedItemId
  )) || null
}

const approvalStatusCandidates = (transaction) => [
  transaction?.transaction_approve_status_name,
  transaction?.transaction_payment_status_name,
  transaction?.transaction_status_name,
  transaction?.payment_status,
  transaction?.approve_status,
  transaction?.status,
  transaction?.ms_transaction_status?.ms_transaction_status_name,
  transaction?.ms_payment_status?.ms_payment_status_name,
  transaction?.ms_approve_status?.ms_approve_status_name
]

const shippingStatusCandidates = (transaction) => [
  transaction?.ms_shipping_status?.ms_shipping_status_name,
  transaction?.transaction_shipping_status_name,
  transaction?.shipping_status_name,
  transaction?.delivery_status_name,
  transaction?.transaction_delivery_status_name,
  transaction?.ms_delivery_status?.ms_delivery_status_name,
  transaction?.ms_delivery_status_name,
  transaction?.shipping_status,
  transaction?.delivery_status
]

const isApprovalFinal = (transaction) => (
  hasFinalStatus(approvalStatusCandidates(transaction), FINAL_APPROVAL_STATUSES)
)

const isTransactionReviewable = (transaction) => (
  isApprovalFinal(transaction)
)

const getTransactionReviewReason = (transaction) => {
  if (!isApprovalFinal(transaction)) {
    return 'Transaksi belum selesai'
  }

  return null
}

const findExistingReview = async ({ memberId, itemId, transactionId, transactionNumber }) => {
  if (transactionNumber) {
    const reviewByNumber = await ProductReview.query()
      .where('member_id', memberId)
      .where('item_id', itemId)
      .where('transaction_number', transactionNumber)
      .first()

    if (reviewByNumber) return reviewByNumber
  }

  if (transactionId) {
    return ProductReview.query()
      .where('member_id', memberId)
      .where('item_id', itemId)
      .where('transaction_id', transactionId)
      .first()
  }

  return null
}

const buildReviewIndex = (reviews) => {
  const keys = new Map()
  reviews.forEach((review) => {
    const itemId = normalizeIdentifier(review?.item_id)
    const transactionNumber = normalizeIdentifier(review?.transaction_number)
    const transactionId = normalizeIdentifier(review?.transaction_id)

    if (itemId && transactionNumber) {
      keys.set(`${itemId}|number|${transactionNumber}`, review)
    }

    if (itemId && transactionId) {
      keys.set(`${itemId}|id|${transactionId}`, review)
    }
  })

  return keys
}

const getReviewForReference = (reviewKeys, itemId, transactionReference) => {
  const normalizedItemId = normalizeIdentifier(itemId)
  const transactionNumber = normalizeIdentifier(transactionReference?.transaction_number)
  const transactionId = normalizeIdentifier(transactionReference?.transaction_id)

  if (normalizedItemId && transactionNumber) {
    const reviewByNumber = reviewKeys.get(`${normalizedItemId}|number|${transactionNumber}`)
    if (reviewByNumber) return reviewByNumber
  }

  if (normalizedItemId && transactionId) {
    return reviewKeys.get(`${normalizedItemId}|id|${transactionId}`) || null
  }

  return null
}

const hasReviewForReference = (reviewKeys, itemId, transactionReference) => {
  return Boolean(getReviewForReference(reviewKeys, itemId, transactionReference))
}

const appendReviewEligibilityToTransactions = async (transactions, memberId) => {
  if (!Array.isArray(transactions) || transactions.length === 0) return transactions

  const itemIds = []
  transactions.forEach((transaction) => {
    getTransactionDetailList(transaction).forEach((detail) => {
      const itemId = extractReviewItemId(detail)
      if (itemId) itemIds.push(itemId)
    })
  })

  const uniqueItemIds = [...new Set(itemIds.map((itemId) => normalizeIdentifier(itemId)).filter(Boolean))]
  let reviewKeys = new Set()

  if (uniqueItemIds.length > 0) {
    const reviews = await ProductReview.query()
      .where('member_id', memberId)
      .whereIn('item_id', uniqueItemIds)
      .fetch()

    reviewKeys = buildReviewIndex(reviews.toJSON())
  }

  return transactions.map((transaction) => {
    const transactionReference = extractTransactionReference(transaction)
    const transactionCanReview = isTransactionReviewable(transaction)
    const transactionReason = getTransactionReviewReason(transaction)
    const detailList = getTransactionDetailList(transaction)

    return {
      ...transaction,
      transaction_detail: detailList.map((detail) => {
        const itemId = extractReviewItemId(detail)
        const transactionDetailId = extractTransactionDetailId(detail)
        const existingReview = getReviewForReference(reviewKeys, itemId, transactionReference)
        const alreadyReviewed = Boolean(existingReview)
        const missingItemId = !itemId
        const canReview = Boolean(itemId && transactionCanReview && !alreadyReviewed)

        let reason = null
        if (missingItemId) {
          reason = 'item_id tidak tersedia'
        } else if (alreadyReviewed) {
          reason = 'Sudah direview'
        } else if (!transactionCanReview) {
          reason = transactionReason
        }

        return {
          ...detail,
          review_eligibility: {
            item_id: itemId || null,
            transaction_id: transactionReference.transaction_id || null,
            transaction_number: transactionReference.transaction_number || null,
            transaction_detail_id: transactionDetailId || null,
            can_review: canReview,
            already_reviewed: alreadyReviewed,
            review: existingReview || null,
            reason
          }
        }
      })
    }
  })
}

const decorateTransactionPayload = async (payload, memberId) => {
  const rows = getTransactionRows(payload)
  const decoratedRows = await appendReviewEligibilityToTransactions(rows, memberId)

  if (Array.isArray(payload?.data)) {
    return {
      ...payload,
      data: decoratedRows
    }
  }

  if (Array.isArray(payload?.data?.data)) {
    return {
      ...payload,
      data: {
        ...payload.data,
        data: decoratedRows
      }
    }
  }

  if (Array.isArray(payload?.transactions)) {
    return {
      ...payload,
      transactions: decoratedRows
    }
  }

  return payload
}

const findMemberTransaction = async ({ email, transactionId, transactionNumber }) => {
  const marketplaceCore = Env.get('MARKETPLACE_CORE')
  const targetTransactionId = normalizeIdentifier(transactionId)
  const targetTransactionNumber = normalizeIdentifier(transactionNumber)

  if (!marketplaceCore || !email || (!targetTransactionId && !targetTransactionNumber)) {
    return null
  }

  let page = 1
  const rows = 50
  const maxPages = 20

  while (page <= maxPages) {
    const requestQuery = {
      page,
      rows,
      order_by: 'transaction_created_datetime',
      sort_by: 'desc'
    }

    if (targetTransactionId) requestQuery.transaction_id = targetTransactionId
    if (targetTransactionNumber) requestQuery.transaction_number = targetTransactionNumber

    const res = await axios.get(`${marketplaceCore}transaction/email/${email}?${qs.stringify(requestQuery)}`)
    const payload = res?.data || {}
    const isSuccess = payload?.success || payload?.status

    if (!isSuccess) {
      throw new Error(payload?.error || payload?.message || 'Gagal mengambil data transaksi')
    }

    const transactions = getTransactionRows(payload)
    const found = transactions.find((transaction) => {
      const reference = extractTransactionReference(transaction)
      const currentId = normalizeIdentifier(reference.transaction_id)
      const currentNumber = normalizeIdentifier(reference.transaction_number)

      return Boolean(
        (targetTransactionId && currentId === targetTransactionId) ||
        (targetTransactionNumber && currentNumber === targetTransactionNumber)
      )
    })

    if (found) return found
    if (transactions.length === 0) return null

    const lastPage = getLastPage(payload, page)
    if (page >= lastPage) return null

    page += 1
  }

  return null
}

module.exports = {
  appendReviewEligibilityToTransactions,
  decorateTransactionPayload,
  extractReviewItemId,
  extractTransactionDetailId,
  extractTransactionReference,
  findExistingReview,
  findMemberTransaction,
  findTransactionDetailByItemId,
  getTransactionReviewReason,
  isTransactionReviewable
}
