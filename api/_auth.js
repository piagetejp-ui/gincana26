import { adminAuth } from './_firebaseAdmin.js'

export async function requireUser(req) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    const err = new Error('Autenticação obrigatória')
    err.status = 401
    throw err
  }
  try {
    return await adminAuth.verifyIdToken(match[1])
  } catch {
    const err = new Error('Sessão inválida ou expirada')
    err.status = 401
    throw err
  }
}
