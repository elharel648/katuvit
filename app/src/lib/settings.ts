import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type ExportQuality = '1080p' | '720p';
export type CaptionSize = 'small' | 'medium' | 'large';

export interface AppSettings {
  exportQuality: ExportQuality;
  captionSize: CaptionSize;
  /** template id the editor starts with */
  defaultTemplate: string;
}

const DEFAULTS: AppSettings = { exportQuality: '1080p', captionSize: 'medium', defaultTemplate: 'bold' };
const KEY = 'katuvit.settings.v1';

let cached: AppSettings = { ...DEFAULTS };
const listeners = new Set<() => void>();

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) cached = { ...DEFAULTS, ...JSON.parse(raw) };
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
