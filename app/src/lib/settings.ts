import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { DEFAULT_STYLE } from './templates';
import type { StyleChoice } from './types';

export type ExportQuality = '1080p' | '720p';
export type CaptionSize = 'small' | 'medium' | 'large';

export interface AppSettings {
  exportQuality: ExportQuality;
  captionSize: CaptionSize;
  /** style the editor starts with */
  defaultStyle: StyleChoice;
  /** names and brand words the user taught us; sent to the server as a decoding hint */
  dictionary: string[];
}

export const DICTIONARY_MAX = 40;
const DEFAULTS: AppSettings = { exportQuality: '1080p', captionSize: 'medium', defaultStyle: DEFAULT_STYLE, dictionary: [] };
const KEY = 'katuvit.settings.v1';

let cached: AppSettings = { ...DEFAULTS };
const listeners = new Set<() => void>();

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      cached = {
        ...DEFAULTS,
        ...parsed,
        defaultStyle: { ...DEFAULT_STYLE, ...(parsed.defaultStyle ?? {}) },
        dictionary: Array.isArray(parsed.dictionary) ? parsed.dictionary.filter((w: unknown) => typeof w === 'string') : [],
      };
    }
  } catch {}
  return cached;
}

export function getSettings(): AppSettings {
  return cached;
}

export async function updateSettings(patch: Partial<AppSettings>) {
  cached = { ...cached, ...patch };
  listeners.forEach((fn) => fn());
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cached));
  } catch {}
}

/** learn a word (from "replace everywhere" or a manual add); newest first, capped */
export function addToDictionary(word: string) {
  const w = word.trim();
  if (!w || w.length > 30 || /\s/.test(w)) return;
  const rest = cached.dictionary.filter((x) => x.toLowerCase() !== w.toLowerCase());
  updateSettings({ dictionary: [w, ...rest].slice(0, DICTIONARY_MAX) });
}

export function removeFromDictionary(word: string) {
  updateSettings({ dictionary: cached.dictionary.filter((x) => x !== word) });
}

/** react hook: settings value that re-renders on change */
export function useSettings(): AppSettings {
  const [value, setValue] = useState(cached);
  useEffect(() => {
    loadSettings().then(() => setValue({ ...cached }));
    const fn = () => setValue({ ...cached });
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return value;
}

export const CAPTION_SIZE_LABELS: Record<CaptionSize, string> = {
  small: 'קטן',
  medium: 'בינוני',
  large: 'גדול',
};

/** ASS font size sent to the burn server per caption size */
export const CAPTION_SIZE_FONT: Record<CaptionSize, number> = {
  small: 92,
  medium: 108,
  large: 124,
};
