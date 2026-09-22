import { db, FieldValue } from './_firebaseAdmin.js'

const HANDLE = process.env.INFINITEPAY_HANDLE || 'piaget'

export async function checkInfinitePay({ orderNsu, transactionNsu, slug }) {
  const response = await fetch('https://api.checkout.infinitepay.io/payment_check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      handle: HANDLE,
      order_nsu: orderNsu,
      transaction_nsu: transactionNsu,
      slug
    })
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.message || 'Falha ao consultar o pagamento na InfinitePay')
  }
  return data
}

export async function confirmOrderPaid({ orderNsu, transactionNsu, slug, receiptUrl, captureMethod, paidAmount, installments, verifiedBy = 'infinitepay' }) {
  const orderRef = db.collection('gincana2026_pagamentos').doc(orderNsu)

  return db.runTransaction(async tx => {
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists) {
      const err = new Error('Pedido não encontrado')
      err.status = 404
      throw err
    }

    const order = orderSnap.data()
    if (order.status === 'paid') {
      return { status: 'paid', order }
    }

    const participantRefs = order.studentIds.map(id => db.collection('gincana2026_participantes').doc(id))
    const participantSnaps = await Promise.all(participantRefs.map(ref => tx.get(ref)))

    const conflict = participantSnaps.find(snap => {
      if (!snap.exists) return false
      const data = snap.data()
      if (data.status === 'confirmed' && data.orderNsu !== orderNsu) return true
      if (data.status === 'pending_checkout' && data.orderNsu !== orderNsu && data.reservationExpiresAt?.toMillis?.() > Date.now()) return true
      return false
    })

    if (conflict) {
      tx.update(orderRef, {
        status: 'paid_conflict',
        transactionNsu,
        invoiceSlug: slug,
        receiptUrl: receiptUrl || null,
        captureMethod: captureMethod || null,
        paidAmount: paidAmount ?? null,
        installments: installments ?? null,
        paidAt: FieldValue.serverTimestamp(),
        conflictStudentId: conflict.id,
        updatedAt: FieldValue.serverTimestamp()
      })
      tx.set(db.collection('gincana2026_eventos_pagamento').doc(), {
        type: 'payment_conflict', orderNsu, studentId: conflict.id,
        createdAt: FieldValue.serverTimestamp()
      })
      return { status: 'paid_conflict', order: { ...order, orderNsu } }
    }

    const confirmedAt = FieldValue.serverTimestamp()
    order.students.forEach((student, index) => {
      tx.set(participantRefs[index], {
        studentId: student.id,
        name: student.name,
        grade: student.grade,
        team: student.team,
        status: 'confirmed',
        orderNsu,
        origin: order.origin,
        paymentMethod: captureMethod || order.paymentMethod || 'infinitepay',
        amount: 3600,
        responsibleName: order.responsibleName,
        responsiblePhone: order.responsiblePhone,
        confirmedAt,
        updatedAt: confirmedAt
      }, { merge: true })
    })

    tx.update(orderRef, {
      status: 'paid',
      transactionNsu,
      invoiceSlug: slug,
      receiptUrl: receiptUrl || null,
      captureMethod: captureMethod || null,
      paidAmount: paidAmount ?? null,
      installments: installments ?? null,
      verifiedBy,
      paidAt: confirmedAt,
      updatedAt: confirmedAt
    })

    tx.set(db.collection('gincana2026_eventos_pagamento').doc(), {
      type: 'payment_confirmed', orderNsu,
      studentIds: order.studentIds,
      origin: order.origin,
      captureMethod: captureMethod || null,
      createdAt: confirmedAt
    })

    return {
      status: 'paid',
      order: {
        ...order,
        orderNsu,
        status: 'paid',
        transactionNsu,
        invoiceSlug: slug,
        receiptUrl: receiptUrl || null,
        captureMethod: captureMethod || null,
        paidAmount: paidAmount ?? null,
        installments: installments ?? null
      }
    }
  })
}
