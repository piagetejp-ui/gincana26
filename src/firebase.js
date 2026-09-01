import { initializeApp } from 'firebase/app'
import { doc, getFirestore, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import {
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'

const config = {
  apiKey: 'AIzaSyBf5mrpUFipHdOnVCw3k4nL9LOBEtQlHp8',
  authDomain: 'saojoao26-fc92c.firebaseapp.com',
  projectId: 'saojoao26-fc92c',
  storageBucket: 'saojoao26-fc92c.firebasestorage.app',
  messagingSenderId: '624266104941',
  appId: '1:624266104941:web:d5751e461e2beafa146f64',
}

const app = initializeApp(config)
const db = getFirestore(app)
const auth = getAuth(app)

const gincanaDoc = (id) => doc(db, 'gincana2026', id)
const stateRef = () => gincanaDoc('state')

function safeDocPart(value) {
  return String(value || 'sem-sessao').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
}

export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback)
}

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password)
}

export async function logout() {
  return signOut(auth)
}

export async function reauthenticateCurrentUser(password) {
  const user = auth.currentUser
  if (!user?.email) throw new Error('Usuário não autenticado.')
  const credential = EmailAuthProvider.credential(user.email, password)
  return reauthenticateWithCredential(user, credential)
}

export function subscribeRemoteState(callback, onError) {
  return onSnapshot(
    stateRef(),
    (snap) => callback(snap.exists() ? snap.data() : null),
    (error) => {
      console.warn('Falha ao ler estado remoto da gincana:', error)
      onError?.(error)
    },
  )
}

export async function saveRemoteState(state) {
  await setDoc(stateRef(), {
    ...state,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.email || null,
  }, { merge: false })
}

// Cada sorteio é gravado de duas maneiras em uma única operação atômica:
// 1) atualiza o estado corrente; 2) cria um documento de auditoria imutável da sessão.
// Os documentos de auditoria ficam NA MESMA coleção gincana2026, portanto as regras
// atuais match /gincana2026/{document} continuam suficientes.
export async function commitDraw(state, auditEntry) {
  const batch = writeBatch(db)
  batch.set(stateRef(), {
    ...state,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.email || null,
  }, { merge: false })

  const auditId = `audit_${safeDocPart(auditEntry.sessionId)}_${String(auditEntry.drawNumber).padStart(3, '0')}`
  batch.set(gincanaDoc(auditId), {
    ...auditEntry,
    serverAt: serverTimestamp(),
    operator: auth.currentUser?.email || auditEntry.operator || null,
  }, { merge: false })

  await batch.commit()
}

// Reset atômico: primeiro preserva a sessão inteira em backup e, na mesma operação,
// substitui o estado corrente por uma nova sessão zerada.
export async function resetRemoteState(previousState, nextState) {
  const batch = writeBatch(db)
  const previousSession = safeDocPart(previousState?.sessionId || Date.now())
  const backupPayload = {
    ...previousState,
    backupCreatedAt: serverTimestamp(),
    backupCreatedBy: auth.currentUser?.email || null,
  }

  batch.set(gincanaDoc(`backup_${previousSession}`), backupPayload, { merge: false })
  batch.set(gincanaDoc('backup_latest'), backupPayload, { merge: false })
  batch.set(stateRef(), {
    ...nextState,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.email || null,
  }, { merge: false })

  await batch.commit()
}
