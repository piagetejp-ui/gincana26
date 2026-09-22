import { db, FieldValue } from './_firebaseAdmin.js'
import { checkInfinitePay, confirmOrderPaid } from './_payments.js'
import { json } from './_utils.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { success: false, message: 'Método não permitido' })
  try {
    const body = req.body || {}
    const orderNsu = body.order_nsu
    const transactionNsu = body.transaction_nsu
    const slug = body.invoice_slug
    if (!orderNsu || !transactionNsu || !slug) {
      return json(res, 400, { success: false, message: 'Webhook incompleto' })
    }

    const orderSnap = await db.collection('gincana2026_pagamentos').doc(orderNsu).get()
    if (!orderSnap.exists) return json(res, 400, { success: false, message: 'Pedido não encontrado' })
    const order = orderSnap.data()

    const check = await checkInfinitePay({ orderNsu, transactionNsu, slug })
    if (!check?.paid) return json(res, 400, { success: false, message: 'Pagamento ainda não confirmado' })
    if (Number(check.amount) !== Number(order.total)) {
      await orderSnap.ref.update({ status: 'amount_mismatch', receivedAmount: check.amount, updatedAt: FieldValue.serverTimestamp() })
      return json(res, 400, { success: false, message: 'Valor divergente' })
    }

    await confirmOrderPaid({
      orderNsu,
      transactionNsu,
      slug,
      receiptUrl: body.receipt_url,
      captureMethod: check.capture_method || body.capture_method,
      paidAmount: check.paid_amount,
      installments: check.installments,
      verifiedBy: 'webhook+payment_check'
    })

    return json(res, 200, { success: true, message: null })
  } catch (error) {
    return json(res, 400, { success: false, message: error.message || 'Falha ao processar webhook' })
  }
}
