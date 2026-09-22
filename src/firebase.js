import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyBf5mrpUFipHdOnVCw3k4nL9LOBEtQlHp8',
  authDomain: 'saojoao26-fc92c.firebaseapp.com',
  projectId: 'saojoao26-fc92c',
  storageBucket: 'saojoao26-fc92c.firebasestorage.app',
  messagingSenderId: '624266104941',
  appId: '1:624266104941:web:d5751e461e2beafa146f64'
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
