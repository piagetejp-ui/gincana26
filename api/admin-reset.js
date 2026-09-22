import { db } from './_firebaseAdmin.js'
import { requireUser } from './_auth.js'
import { json } from './_utils.js'

async function deleteCollection(name, batchSize = 200) {
  let total = 0
  while (true) {
    const snap = await db.collection(name).limit(batchSize).get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach(doc => batch.delete(doc.ref))
    await batch.commit()
    total += snap.size
    if (snap.size < batchSize) break
  }
  return total
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' })
  try {
    await requireUser(req)
    const { confirmation } = req.body || {}
    if (confirmation !== 'RESETAR GINCANA') {
      return json(res, 400, { error: 'Confirmação inválida.' })
    }

    const deletedParticipants = await deleteCollection('gincana2026_participantes')
    const deletedOrders = await deleteCollection('gincana2026_pagamentos')
    const deletedEvents = await deleteCollection('gincana2026_eventos_pagamento')

    return json(res, 200, {
      success: true,
      deletedParticipants,
      deletedOrders,
      deletedEvents
    })
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Não foi possível resetar a base da Gincana.' })
  }
}
