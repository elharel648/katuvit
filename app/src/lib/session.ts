import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LegacyFS from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';

import type { CaptionLine, StyleChoice, TranscriptSegment } from './types';

/**
 * Editing sessions, persisted. A session is one uploaded video + its transcript + the user's
 * edits, so closing the app no longer throws the transcript away (and with it a paid video).
 * The video file is copied into the app's documents folder (the picker's copy lives in a cache
 * iOS may purge). Sessions expire with the server's media lifecycle: 24 hours after upload the
 * source is gone from the bucket, so a burn can't happen anyway — expired sessions are purged.
 */
export interface EditingSession {
  id: string; // = mediaId
  mediaId: string;
  videoUri: string;
  segments: TranscriptSegment[];
  duration: number;
  createdAt: number; // ms epoch
  /** the user's edited lines (undefined until they edit something) */
  lines?: CaptionLine[];
  style?: StyleChoice;
  thumbUri?: string;
}

const KEY = 'katuvit.sessions.v1';
const MAX_SESSIONS = 10;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DIR = `${LegacyFS.documentDirectory}sessions/`;

let sessions: EditingSession[] = []; // newest first
let currentId: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

async function persist() {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(sessions));
  } catch (e) {
    console.log('[sessions] persist failed', e);
  }
}

async function deleteFile(uri: string | undefined) {
  if (!uri || !uri.startsWith(DIR)) return;
  await LegacyFS.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

export function isExpired(s: EditingSession, now = Date.now()): boolean {
  return now - s.createdAt > SESSION_TTL_MS;
}

/** load from disk once; drops expired sessions and sessions whose video file vanished */
export async function loadSessions(): Promise<EditingSession[]> {
  if (loaded) return sessions;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: EditingSession[] = raw ? JSON.parse(raw) : [];
    const keep: EditingSession[] = [];
    for (const s of parsed) {
      const info = await LegacyFS.getInfoAsync(s.videoUri).catch(() => null);
      if (isExpired(s) || !info?.exists) {
        await deleteFile(s.videoUri);
        await deleteFile(s.thumbUri);
        continue;
      }
      keep.push(s);
    }
    sessions = keep;
    if (keep.length !== parsed.length) await persist();
  } catch (e) {
    console.log('[sessions] load failed', e);
    sessions = [];
  }
  emit();
  return sessions;
}

export function getSessions(): EditingSession[] {
  return sessions;
}

/** the session the editor opens */
export function getSession(): EditingSession | null {
  return sessions.find((s) => s.id === currentId) ?? null;
}

export function setCurrentSession(id: string) {
  currentId = id;
  emit();
}

/** after a successful transcription: copy the video somewhere durable and remember everything */
export async function startSession(input: {
  videoUri: string;
  segments: TranscriptSegment[];
  duration: number;
  mediaId: string;
}): Promise<EditingSession> {
  await LegacyFS.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  const ext = input.videoUri.split('.').pop()?.toLowerCase() ?? 'mp4';
  const dest = `${DIR}${input.mediaId}.${ext.length <= 4 ? ext : 'mp4'}`;
  let videoUri = input.videoUri;
  try {
    await LegacyFS.copyAsync({ from: input.videoUri, to: dest });
    videoUri = dest;
  } catch (e) {
    console.log('[sessions] copy failed, keeping the picker uri', e);
  }
  const session: EditingSession = {
    id: input.mediaId,
    mediaId: input.mediaId,
    videoUri,
    segments: input.segments,
    duration: input.duration,
    createdAt: Date.now(),
  };
  const evicted = sessions.slice(MAX_SESSIONS - 1);
  sessions = [session, ...sessions.filter((s) => s.id !== session.id)].slice(0, MAX_SESSIONS);
  currentId = session.id;
  emit();
  await persist();
  for (const s of evicted) {
    await deleteFile(s.videoUri);
    await deleteFile(s.thumbUri);
  }
  return session;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** merge a patch into a session; disk write is debounced (edits come in bursts) */
export function updateSession(id: string, patch: Partial<Pick<EditingSession, 'lines' | 'style' | 'thumbUri'>>) {
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx < 0) return;
  sessions = sessions.map((s, i) => (i === idx ? { ...s, ...patch } : s));
  emit();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persist();
  }, 400);
}

export async function removeSession(id: string) {
  const gone = sessions.find((s) => s.id === id);
  sessions = sessions.filter((s) => s.id !== id);
  if (currentId === id) currentId = null;
  emit();
  await persist();
  await deleteFile(gone?.videoUri);
  await deleteFile(gone?.thumbUri);
}

/** react hook: the live list (newest first) */
export function useSessions(): EditingSession[] {
  const [value, setValue] = useState(sessions);
  useEffect(() => {
    loadSessions().then(() => setValue([...sessions]));
    const fn = () => setValue([...sessions]);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return value;
}

/** "לפני 5 דק׳" style label for a session card */
export function ageLabel(s: EditingSession, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - s.createdAt) / 60000));
  if (min < 1) return 'עכשיו';
  if (min < 60) return `לפני ${min} דק׳`;
  const h = Math.round(min / 60);
  return h === 1 ? 'לפני שעה' : `לפני ${h} שעות`;
}
