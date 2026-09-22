import { db } from './_firebaseAdmin.js'
import { checkInfinitePay, confirmOrderPaid } from './_payments.js'
import { json } from './_utils.js'

function safeOrder(orderNsu, data) {
  return {
    orderNsu,
    status: data.status,
    students: data.students || [],
    total: data.total || 0,
    responsibleName: data.responsibleName || '',
    receiptUrl: data.receiptUrl || null,
    captureMethod: data.captureMethod || data.paymentMethod || null,
    installments: data.installments || null,
    paidAmount: data.paidAmount || null,
    origin: data.origin || null,
    paidAt: data.paidAt?.toDate?.()?.toISOString?.() || null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' })
  try {
    const { order_nsu: orderNsu, transaction_nsu: transactionNsu, slug, receipt_url: receiptUrl, capture_method: captureMethod } = req.body || {}
    if (!orderNsu) return json(res, 400, { error: 'Pedido não informado' })

    const ref = db.collection('gincana2026_pagamentos').doc(orderNsu)
    const snap = await ref.get()
    if (!snap.exists) return json(res, 404, { error: 'Pedido não encontrado' })
    const order = snap.data()

    if (order.status === 'paid' || order.status === 'paid_conflict') {
      return json(res, 200, safeOrder(orderNsu, order))
    }

    if (!transactionNsu || !slug) {
      return json(res, 200, safeOrder(orderNsu, order))
    }

    const check = await checkInfinitePay({ orderNsu, transactionNsu, slug })
    if (!check?.paid) return json(res, 200, safeOrder(orderNsu, order))
    if (Number(check.amount) !== Number(order.total)) {
      return json(res, 409, { error: 'O pagamento retornou com valor diferente do pedido.' })
    }

    const result = await confirmOrderPaid({
      orderNsu,
      transactionNsu,
      slug,
      receiptUrl,
      captureMethod: check.capture_method || captureMethod,
      paidAmount: check.paid_amount,
      installments: check.installments,
      verifiedBy: 'return+payment_check'
    })

    return json(res, 200, safeOrder(orderNsu, result.order))
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Não foi possível verificar o pagamento' })
  }
}
