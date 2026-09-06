import { deleteUser, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';

import { auth } from './firebase';

/**
 * Identity. Everyone starts as a guest (anonymous Firebase user) so quotas work
 * from the first video; Apple/Google sign-in links onto the same uid later, so
 * credits are never lost. Signing a GUEST out would orphan their credits — we
 * never offer that; only "delete account".
 */

let ready: Promise<User> | null = null;

export function ensureSignedIn(): Promise<User> {
  if (!ready) {
    ready = new Promise<User>((resolve, reject) => {
      const stop = onAuthStateChanged(auth, async (user) => {
        stop();
        if (user) return resolve(user);
        try {
          const cred = await signInAnonymously(auth);
          resolve(cred.user);
        } catch (e) {
          ready = null;
          reject(e);
        }
      });
    });
  }
  return ready;
}

/** Firebase ID token for the worker (refreshes itself when close to expiry) */
export async function getIdToken(): Promise<string> {
  const user = await ensureSignedIn();
  return user.getIdToken();
}

export function currentUser(): User | null {
  return auth.currentUser;
}

export function isGuest(): boolean {
  return auth.currentUser?.isAnonymous ?? true;
}

/** which provider the account is linked to, for the settings screen */
export function providerLabel(): string {
  const u = auth.currentUser;
  if (!u || u.isAnonymous) return 'אורח';
  const id = u.providerData[0]?.providerId ?? '';
  if (id.includes('apple')) return 'Apple';
  if (id.includes('google')) return 'Google';
  return id || 'חשבון';
}

/** removes the local auth user after the server wiped its data; a fresh guest is created next launch */
export async function deleteLocalUser(): Promise<void> {
  const u = auth.currentUser;
  if (u) {
    try {
      await deleteUser(u);
    } catch {
      // server already deleted it; local state clears on next sign-in
    }
  }
  ready = null;
}
