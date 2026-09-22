import { createCheckout } from './_checkout.js'
import { requireUser } from './_auth.js'
import { json } from './_utils.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' })
  try {
    let operator = null
    let origin = 'online'
    if (req.headers.authorization) {
      operator = await requireUser(req)
      origin = 'secretaria_infinitepay'
    }
    const result = await createCheckout(req, req.body || {}, { origin, operator })
    return json(res, 200, result)
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Erro ao criar pagamento' })
  }
}
