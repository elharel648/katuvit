import { getApps, initializeApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, initializeAuth, signInAnonymously } from 'firebase/auth';
// @ts-expect-error exported by firebase/auth's react-native build; absent from the web typings
import { getReactNativePersistence } from 'firebase/auth';
import { doc, getFirestore, onSnapshot } from 'firebase/firestore';

// Firebase web config is public by design; security lives in Firestore rules.
const firebaseConfig = {
  projectId: 'katuvit-6bb08',
  appId: '1:898295386332:web:aa4dfb9c606b97e009e419',
  apiKey: 'AIzaSyCo73imtyJSm-dE1Z_jGMEgXNFMGEc7r98',
  authDomain: 'katuvit-6bb08.firebaseapp.com',
  messagingSenderId: '898295386332',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// initializeAuth throws if called twice (fast refresh) — fall back to the existing instance.
// Without RN persistence every launch would mint a NEW anonymous user (quota/credits break).
function makeAuth() {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    return getAuth(app);
  }
}
export const auth = makeAuth();
export const db = getFirestore(app);

/** call once on app start; resolves to the anonymous uid */
export async function ensureSignedIn(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

/** listen to a transcription/burn job document in real time */
export function watchJob(
  jobId: string,
  onChange: (data: Record<string, unknown> | undefined) => void,
) {
  return onSnapshot(doc(db, 'jobs', jobId), (snap) => onChange(snap.data()));
}
