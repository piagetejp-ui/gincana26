import { db, FieldValue } from './_firebaseAdmin.js'
import { requireUser } from './_auth.js'
import { json } from './_utils.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' })
  try {
    const user = await requireUser(req)
    const studentId = String(req.body?.studentId || '')
    const reason = String(req.body?.reason || '').trim()
    if (!studentId || reason.length < 4) return json(res, 400, { error: 'Informe o aluno e o motivo do cancelamento' })

    const ref = db.collection('gincana2026_participantes').doc(studentId)
    const snap = await ref.get()
    if (!snap.exists || snap.data().status !== 'confirmed') return json(res, 409, { error: 'A participação não está confirmada' })
    const before = snap.data()

    const batch = db.batch()
    batch.set(ref, {
      status: 'cancelled',
      cancelledAt: FieldValue.serverTimestamp(),
      cancelReason: reason,
      cancelledBy: { uid: user.uid, email: user.email || null },
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true })
    batch.set(db.collection('gincana2026_eventos_pagamento').doc(), {
      type: 'participation_cancelled',
      studentId,
      previousOrderNsu: before.orderNsu || null,
      reason,
      operator: { uid: user.uid, email: user.email || null },
      createdAt: FieldValue.serverTimestamp()
    })
    await batch.commit()

    return json(res, 200, { success: true })
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Não foi possível cancelar a confirmação' })
  }
}
