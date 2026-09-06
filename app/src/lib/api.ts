import { File, Paths } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { BURN_URL, KATUVIT_API_KEY, TRANSCRIBE_UPLOAD_URL } from './config';
import type { TranscriptSegment } from './types';

/** server error codes -> what the user should read */
const ERROR_HE: Record<string, string> = {
  unauthorized: 'בעיית הרשאה מול השרת — עדכנו את האפליקציה',
  too_large: 'הסרטון גדול מדי (עד 400MB)',
  too_long: 'הסרטון ארוך מדי — עד 3 דקות בגרסה הזו',
  unreadable_media: 'לא הצלחנו לקרוא את קובץ הסרטון',
  decode_failed: 'לא הצלחנו לעבד את הסרטון — נסו קובץ אחר',
  media_not_found: 'הסרטון כבר לא בשרת — העלו אותו שוב',
  burn_failed: 'הצריבה נכשלה — נסו שוב',
  no_lines: 'אין כתוביות לצרוב',
};

function messageFor(body: string | undefined, status: number): string {
  try {
    const parsed = JSON.parse(body ?? '');
    if (parsed?.error && ERROR_HE[parsed.error]) return ERROR_HE[parsed.error];
  } catch {}
  return `השרת החזיר שגיאה (${status})`;
}

const BURN_TIMEOUT_MS = 270_000; // server gives up at 240s; Modal at 300s

/**
 * The legacy uploader stages its multipart body in the app cache directory and
 * the new File API writes exports there. If that directory is missing (Expo Go
 * scopes it per project) the upload silently goes out with an EMPTY body — the
 * same symptom a full disk produces (seen 2026-09-06: Content-Length: 0).
 */
export async function ensureCacheDir(): Promise<void> {
  const dir = LegacyFS.cacheDirectory;
  if (!dir) return;
  try {
    const info = await LegacyFS.getInfoAsync(dir);
    console.log('[fs] cacheDirectory', dir, 'exists:', info.exists);
    if (!info.exists) await LegacyFS.makeDirectoryAsync(dir, { intermediates: true });
  } catch (e) {
    console.log('[fs] ensureCacheDir failed', e);
  }
}

export interface TranscribeResult {
  segments: TranscriptSegment[];
  duration: number;
  media_id: string;
}

/**
 * Upload a local video/audio file and get the transcript back.
 * Uses uploadAsync: streams from disk (no 50MB in JS memory), multipart.
 */
export async function uploadAndTranscribe(
  fileUri: string,
): Promise<TranscribeResult> {
  await ensureCacheDir();
  const res = await LegacyFS.uploadAsync(TRANSCRIBE_UPLOAD_URL, fileUri, {
    httpMethod: 'POST',
    uploadType: LegacyFS.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    parameters: { api_key: KATUVIT_API_KEY },
  });
  if (res.status !== 200) throw new Error(messageFor(res.body, res.status));
  const data = JSON.parse(res.body);
  if (!data.segments) throw new Error(data.error ?? 'תשובה לא צפויה מהשרת');
  return data as TranscribeResult;
}

export interface BurnParams {
  mediaId: string;
  template: string;
  lines: { start: number; end: number; text: string }[];
  quality: string;
  fontSize: number;
}

/**
 * Burn captions in the cloud and write the returned MP4 to a local file.
 * Single POST that returns the video bytes directly — avoids the flaky
 * two-step download path. Returns the local file uri.
 */
export async function burnAndDownload(params: BurnParams): Promise<string> {
  await ensureCacheDir();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BURN_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(BURN_URL, {
    signal: controller.signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: KATUVIT_API_KEY,
      media_id: params.mediaId,
      template: params.template,
      lines: params.lines,
      quality: params.quality,
      font_size: params.fontSize,
    }),
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('הצריבה לקחה יותר מדי זמן — נסו סרטון קצר יותר');
    }
    throw new Error('אין חיבור לשרת — בדקו את האינטרנט ונסו שוב');
  }

  if (!res.ok) {
    clearTimeout(timer);
    throw new Error(messageFor(await res.text().catch(() => ''), res.status));
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('video')) {
    clearTimeout(timer);
    throw new Error(messageFor(await res.text().catch(() => ''), res.status));
  }

  const buffer = await res.arrayBuffer();
  clearTimeout(timer);
  const file = new File(Paths.cache, `katuvit-${params.mediaId}.mp4`);
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(buffer));
  return file.uri;
}
