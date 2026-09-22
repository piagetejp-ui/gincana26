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

    await db.runTransaction(async tx => {
      const refs = selected.map(s => db.collection('gincana2026_participantes').doc(s.id))
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
          const err = new Error(`${data.name || 'Aluno'} possui um checkout online em andamento. Aguarde a expiração ou confirme o pagamento online.`)
          err.status = 409
          throw err
        }
      }

      const now = FieldValue.serverTimestamp()
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
        createdAt: now,
        paidAt: now,
        updatedAt: now
      })

      selected.forEach((student, index) => {
        tx.set(refs[index], {
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
        operator: { uid: user.uid, email: user.email || null },
        createdAt: now
      })
    })

    return json(res, 200, { success: true, orderNsu, total: STUDENT_PRICE * selected.length })
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Não foi possível registrar a venda presencial' })
  }
}
