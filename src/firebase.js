import { initializeApp } from 'firebase/app'
import { doc, getDoc, getFirestore, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
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

const stateRef = () => doc(db, 'gincana2026', 'state')
const backupRef = () => doc(db, 'gincana2026', 'backup_latest')

export const firebaseEnabled = true

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
  }, { merge: true })
}

export async function saveResetBackup(state) {
  await setDoc(backupRef(), {
    ...state,
    backupCreatedAt: serverTimestamp(),
    backupCreatedBy: auth.currentUser?.email || null,
  })
}

export async function readResetBackup() {
  const snap = await getDoc(backupRef())
  return snap.exists() ? snap.data() : null
}
