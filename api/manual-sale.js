import { STUDENTS, STUDENT_PRICE } from '../data/students.js'
import { db, FieldValue } from './_firebaseAdmin.js'
import { requireUser } from './_auth.js'
import { json, randomCode } from './_utils.js'

const METHODS = new Set(['cash', 'external_pix', 'card_machine', 'other'])

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' })
  try {
    const user = await requireUser(req)
    const body = req.body || {}
    const ids = [...new Set((body.studentIds || []).map(String))]
    const selected = ids.map(id => STUDENTS.find(s => s.id === id)).filter(Boolean)
    if (!selected.length || selected.length !== ids.length) return json(res, 400, { error: 'Seleção de alunos inválida' })
    if (!METHODS.has(body.paymentMethod)) return json(res, 400, { error: 'Forma de pagamento inválida' })
    if (body.paymentMethod === 'other' && !String(body.note || '').trim()) return json(res, 400, { error: 'Informe uma observação para a forma de pagamento "Outro"' })

    const responsibleName = String(body.responsibleName || '').trim()
    const responsiblePhone = String(body.responsiblePhone || '').trim()
    if (responsibleName.length < 3) return json(res, 400, { error: 'Informe o nome do responsável' })

    const orderNsu = `PRESENCIAL26-${Date.now()}-${randomCode()}`
    const orderRef = db.collection('gincana2026_pagamentos').doc(orderNsu)
    let overriddenOnlineOrders = []

    await db.runTransaction(async tx => {
      const selectedRefs = selected.map(s => db.collection('gincana2026_participantes').doc(s.id))
      const selectedSnaps = await Promise.all(selectedRefs.map(ref => tx.get(ref)))

      for (const snap of selectedSnaps) {
        if (!snap.exists) continue
        const data = snap.data()
        if (data.status === 'confirmed') {
          const err = new Error(`${data.name || 'Aluno'} já está com participação confirmada.`)
          err.status = 409
          throw err
        }
      }

      const activePendingOrderNsus = [...new Set(selectedSnaps
        .filter(snap => {
          if (!snap.exists) return false
          const data = snap.data()
          return data.status === 'pending_checkout' && data.orderNsu && data.reservationExpiresAt?.toMillis?.() > Date.now()
        })
        .map(snap => snap.data().orderNsu))]

      const pendingOrderRefs = activePendingOrderNsus.map(id => db.collection('gincana2026_pagamentos').doc(id))
      const pendingOrderSnaps = await Promise.all(pendingOrderRefs.map(ref => tx.get(ref)))

      const linkedParticipantRefs = new Map()
      pendingOrderSnaps.forEach(snap => {
        if (!snap.exists) return
        const data = snap.data()
        ;(data.studentIds || []).forEach(id => {
          const key = String(id)
          if (!linkedParticipantRefs.has(key)) {
            linkedParticipantRefs.set(key, db.collection('gincana2026_participantes').doc(key))
          }
        })
      })
      selectedRefs.forEach((ref, index) => linkedParticipantRefs.set(selected[index].id, ref))
      const linkedEntries = [...linkedParticipantRefs.entries()]
      const linkedSnaps = await Promise.all(linkedEntries.map(([, ref]) => tx.get(ref)))

      const now = FieldValue.serverTimestamp()

      // A confirmação presencial tem prioridade sobre qualquer checkout online ainda pendente.
      // O link externo pode continuar tecnicamente pagável na InfinitePay; se isso ocorrer depois,
      // o webhook marcará o pedido como conflito/duplicidade para conferência e estorno.
      pendingOrderSnaps.forEach((snap, index) => {
        if (!snap.exists) return
        const pendingOrderNsu = activePendingOrderNsus[index]
        const selectedFromThisOrder = selectedSnaps
          .filter(studentSnap => studentSnap.exists && studentSnap.data().orderNsu === pendingOrderNsu)
          .map(studentSnap => studentSnap.id)

        tx.update(pendingOrderRefs[index], {
          status: 'superseded_by_manual',
          supersededByManualOrderNsu: orderNsu,
          supersededStudentIds: selectedFromThisOrder,
          supersededAt: now,
          updatedAt: now
        })

        tx.set(db.collection('gincana2026_eventos_pagamento').doc(), {
          type: 'checkout_superseded_by_manual',
          onlineOrderNsu: pendingOrderNsu,
          manualOrderNsu: orderNsu,
          studentIds: selectedFromThisOrder,
          operator: { uid: user.uid, email: user.email || null },
          createdAt: now
        })
      })

      linkedSnaps.forEach((snap, index) => {
        if (!snap.exists) return
        const data = snap.data()
        if (data.status === 'pending_checkout' && activePendingOrderNsus.includes(data.orderNsu)) {
          tx.set(linkedEntries[index][1], {
            status: 'available',
            orderNsu: FieldValue.delete(),
            reservationExpiresAt: FieldValue.delete(),
            updatedAt: now
          }, { merge: true })
        }
      })

      tx.set(orderRef, {
        orderNsu,
        status: 'paid',
        origin: 'secretaria_manual',
        paymentMethod: body.paymentMethod,
        note: String(body.note || '').trim() || null,
        operator: { uid: user.uid, email: user.email || null },
        studentIds: selected.map(s => s.id),
        students: selected,
        responsibleName,
        responsiblePhone,
        unitPrice: STUDENT_PRICE,
        total: STUDENT_PRICE * selected.length,
        paidAmount: STUDENT_PRICE * selected.length,
        overriddenOnlineOrders: activePendingOrderNsus,
        createdAt: now,
        paidAt: now,
        updatedAt: now
      })

      selected.forEach((student, index) => {
        tx.set(selectedRefs[index], {
          studentId: student.id,
          name: student.name,
          grade: student.grade,
          team: student.team,
          status: 'confirmed',
          orderNsu,
          origin: 'secretaria_manual',
          paymentMethod: body.paymentMethod,
          amount: STUDENT_PRICE,
          responsibleName,
          responsiblePhone,
          confirmedAt: now,
          updatedAt: now
        }, { merge: true })
      })

      tx.set(db.collection('gincana2026_eventos_pagamento').doc(), {
        type: 'manual_sale_confirmed',
        orderNsu,
        studentIds: selected.map(s => s.id),
        paymentMethod: body.paymentMethod,
        overriddenOnlineOrders: activePendingOrderNsus,
        operator: { uid: user.uid, email: user.email || null },
        createdAt: now
      })

      overriddenOnlineOrders = activePendingOrderNsus
    })

    return json(res, 200, {
      success: true,
      orderNsu,
      total: STUDENT_PRICE * selected.length,
      overriddenCheckouts: overriddenOnlineOrders.length,
      overriddenOnlineOrders
    })
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Não foi possível registrar a venda presencial' })
  }
}
