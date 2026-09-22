import { STUDENTS, STUDENT_PRICE } from '../data/students.js'
import { db, FieldValue, Timestamp } from './_firebaseAdmin.js'
import { normalizePhone, randomCode, siteBase } from './_utils.js'

const HANDLE = process.env.INFINITEPAY_HANDLE || 'piaget'
const RESERVATION_MINUTES = 20

function getSelected(ids) {
  const unique = [...new Set((ids || []).map(String))]
  const selected = unique.map(id => STUDENTS.find(s => s.id === id)).filter(Boolean)
  if (!selected.length || selected.length !== unique.length) {
    const err = new Error('Seleção de alunos inválida')
    err.status = 400
    throw err
  }
  if (selected.length > 10) {
    const err = new Error('Limite de 10 alunos por pagamento')
    err.status = 400
    throw err
  }
  return selected
}

export async function createCheckout(req, body, { origin = 'online', operator = null } = {}) {
  const students = getSelected(body.studentIds)
  const responsibleName = String(body.responsibleName || '').trim()
  const responsiblePhone = String(body.responsiblePhone || '').trim()
  const responsibleEmail = String(body.responsibleEmail || '').trim()

  if (responsibleName.length < 3) {
    const err = new Error('Informe o nome do responsável')
    err.status = 400
    throw err
  }
  if (responsiblePhone.replace(/\D/g, '').length < 10) {
    const err = new Error('Informe um WhatsApp válido')
    err.status = 400
    throw err
  }

  const orderNsu = `GINCANA26-${Date.now()}-${randomCode()}`
  const orderRef = db.collection('gincana2026_pagamentos').doc(orderNsu)
  const expiresAt = Timestamp.fromMillis(Date.now() + RESERVATION_MINUTES * 60_000)

  await db.runTransaction(async tx => {
    const refs = students.map(s => db.collection('gincana2026_participantes').doc(s.id))
    const snaps = await Promise.all(refs.map(ref => tx.get(ref)))

    for (const snap of snaps) {
      if (!snap.exists) continue
      const data = snap.data()
      if (data.status === 'confirmed') {
        const err = new Error(`${data.name || 'Aluno'} já está com participação confirmada.`)
        err.status = 409
        throw err
      }
      if (data.status === 'pending_checkout' && data.reservationExpiresAt?.toMillis?.() > Date.now()) {
        const err = new Error(`${data.name || 'Aluno'} já possui um pagamento em andamento. Tente novamente em alguns minutos ou procure a secretaria.`)
        err.status = 409
        throw err
      }
    }

    const now = FieldValue.serverTimestamp()
    students.forEach((student, index) => {
      tx.set(refs[index], {
        studentId: student.id,
        name: student.name,
        grade: student.grade,
        team: student.team,
        status: 'pending_checkout',
        orderNsu,
        origin,
        reservationExpiresAt: expiresAt,
        updatedAt: now
      }, { merge: true })
    })

    tx.set(orderRef, {
      orderNsu,
      status: 'pending',
      origin,
      operator: operator ? { uid: operator.uid, email: operator.email || null } : null,
      studentIds: students.map(s => s.id),
      students,
      responsibleName,
      responsiblePhone,
      responsibleEmail: responsibleEmail || null,
      unitPrice: STUDENT_PRICE,
      total: STUDENT_PRICE * students.length,
      createdAt: now,
      updatedAt: now,
      reservationExpiresAt: expiresAt
    })
  })

  const base = siteBase(req)
  const payload = {
    handle: HANDLE,
    order_nsu: orderNsu,
    redirect_url: `${base}/retorno`,
    webhook_url: `${base}/api/infinitepay-webhook`,
    customer: {
      name: responsibleName,
      phone_number: normalizePhone(responsiblePhone),
      ...(responsibleEmail ? { email: responsibleEmail } : {})
    },
    items: students.map(student => ({
      quantity: 1,
      price: STUDENT_PRICE,
      description: `Gincana Piaget 2026 - ${student.name}`
    }))
  }

  let checkoutData
  try {
    const response = await fetch('https://api.checkout.infinitepay.io/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    checkoutData = await response.json().catch(() => ({}))
    if (!response.ok || !checkoutData.url) {
      throw new Error(checkoutData?.message || 'A InfinitePay não retornou o link de pagamento')
    }
  } catch (error) {
    const batch = db.batch()
    students.forEach(student => {
      batch.set(db.collection('gincana2026_participantes').doc(student.id), {
        status: 'available',
        orderNsu: FieldValue.delete(),
        reservationExpiresAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true })
    })
    batch.update(orderRef, { status: 'checkout_error', errorMessage: error.message, updatedAt: FieldValue.serverTimestamp() })
    await batch.commit().catch(() => {})
    throw error
  }

  await orderRef.update({ checkoutUrl: checkoutData.url, updatedAt: FieldValue.serverTimestamp() })
  return { orderNsu, checkoutUrl: checkoutData.url, total: STUDENT_PRICE * students.length, students }
}
