import { useEffect, useState } from 'react';

/** what the server says this user may still do */
export interface Entitlements {
  plan: 'free' | 'pro';
  pro_until: number | null;
  credits: number;
  free_used: number;
  free_left: number;
  monthly_used: number;
  monthly_cap: number;
  videos_total: number;
}

let current: Entitlements | null = null;
const listeners = new Set<() => void>();

export function setEntitlements(e: Entitlements) {
  current = e;
  listeners.forEach((fn) => fn());
}

export function getEntitlements(): Entitlements | null {
  return current;
}

/** true when the next video would be refused by the server */
export function isOutOfQuota(e: Entitlements | null): boolean {
  if (!e) return false;
  if (e.plan === 'pro' && e.monthly_used < e.monthly_cap) return false;
  return e.credits <= 0 && e.free_left <= 0;
}

/** short status line for the home screen */
export function quotaLabel(e: Entitlements | null): string | null {
  if (!e) return null;
  if (e.plan === 'pro') return `Pro · ${e.monthly_cap - e.monthly_used} סרטונים החודש`;
  if (e.credits > 0) return `${e.credits} סרטונים בחבילה`;
  if (e.free_left > 0) return `${e.free_left} סרטונים חינם`;
  return 'נגמרו הסרטונים החינמיים';
}

export function useEntitlements(): Entitlements | null {
  const [value, setValue] = useState(current);
  useEffect(() => {
    const fn = () => setValue(current);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return value;
}
