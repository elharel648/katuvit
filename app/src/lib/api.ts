import * as LegacyFS from 'expo-file-system/legacy';

import { getIdToken } from './auth';
import { KATUVIT_API_KEY, WORKER_BASE_URL } from './config';
import { setEntitlements, type Entitlements } from './entitlements';
import type { TranscriptSegment, Word } from './types';

/**
 * Client for the Katuvit worker (Cloud Run, same Google project as Firebase).
 * Video never streams through the worker: the app PUTs it straight to Cloud
 * Storage with a signed URL, and downloads the burned result the same way.
 */

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
  bad_media_id: 'משהו השתבש בזיהוי הסרטון — העלו אותו שוב',
  auth_required: 'צריך להתחבר מחדש — סגרו ופתחו את האפליקציה',
  bad_token: 'ההתחברות פגה — סגרו ופתחו את האפליקציה',
  quota_exceeded: 'נגמרו הסרטונים בחשבון',
};

/** thrown when the server refuses for lack of quota — the UI opens the paywall */
export class QuotaError extends Error {
  entitlements: Entitlements | null;
  constructor(entitlements: Entitlements | null) {
    super(ERROR_HE.quota_exceeded);
    this.name = 'QuotaError';
    this.entitlements = entitlements;
  }
}

function messageFor(body: string | undefined, status: number): string {
  try {
    const parsed = JSON.parse(body ?? '');
    if (parsed?.error && ERROR_HE[parsed.error]) return ERROR_HE[parsed.error];
  } catch {}
  if (status === 404) return 'השרת לא זמין כרגע. נסו שוב בעוד כמה דקות';
  if (status === 429) return 'עומס רגעי בשרת. נסו שוב בעוד דקה';
  if (status >= 500) return 'השרת עמוס או מתעורר. נסו שוב בעוד דקה';
  return `השרת החזיר שגיאה (${status})`;
}

/**
 * The legacy uploader stages its multipart body in the app cache directory and
 * downloads land there too. If the directory is missing (Expo Go scopes it per
 * project) or the disk is full, transfers fail silently — make sure it exists.
 */
export async function ensureCacheDir(): Promise<void> {
  const dir = LegacyFS.cacheDirectory;
  if (!dir) return;
  try {
    const info = await LegacyFS.getInfoAsync(dir);
    if (!info.exists) await LegacyFS.makeDirectoryAsync(dir, { intermediates: true });
  } catch (e) {
    console.log('[fs] ensureCacheDir failed', e);
  }
}

async function postJson<T>(path: string, body: object, timeoutMs: number): Promise<T> {
  const token = await getIdToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${WORKER_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ api_key: KATUVIT_API_KEY, ...body }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('השרת לא ענה בזמן — נסו שוב');
    }
    throw new Error('אין חיבור לשרת — בדקו את האינטרנט ונסו שוב');
  }
  clearTimeout(timer);
  const text = await res.text().catch(() => '');
  if (res.status === 402) {
    let ent: Entitlements | null = null;
    try {
      const { error: _e, ...rest } = JSON.parse(text);
      ent = rest as Entitlements;
      setEntitlements(ent);
    } catch {}
    throw new QuotaError(ent);
  }
  if (!res.ok) throw new Error(messageFor(text, res.status));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('תשובה לא צפויה מהשרת');
  }
}

export interface TranscribeResult {
  segments: TranscriptSegment[];
  duration: number;
  media_id: string;
  entitlements?: Entitlements;
}

/** entitlements for the signed-in user; also creates the user record on first call */
export async function fetchMe(): Promise<Entitlements> {
  const e = await postJson<Entitlements>('/me', {}, 30_000);
  setEntitlements(e);
  return e;
}

/** server-side account deletion (user record, media records, auth user) */
export async function deleteAccountOnServer(): Promise<void> {
  await postJson<{ ok: boolean }>('/delete-account', {}, 60_000);
}

export interface UploadCallbacks {
  /** 0..1 as bytes leave the device */
  onProgress?: (fraction: number) => void;
  /** the whole file is in the cloud; transcription (no progress info) starts now */
  onUploaded?: () => void;
}

interface UploadTicket {
  media_id: string;
  upload_url: string;
  content_type: string;
}

/**
 * Upload a local video and get the transcript back:
 * signed URL → PUT straight to Cloud Storage (byte-level progress) → transcribe.
 */
export async function uploadAndTranscribe(
  fileUri: string,
  callbacks: UploadCallbacks = {},
): Promise<TranscribeResult> {
  await ensureCacheDir();
  const ticket = await postJson<UploadTicket>('/upload-url', {}, 30_000);

  const task = LegacyFS.createUploadTask(
    ticket.upload_url,
    fileUri,
    {
      httpMethod: 'PUT',
      uploadType: LegacyFS.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': ticket.content_type },
    },
    ({ totalBytesSent, totalBytesExpectedToSend }) => {
      if (totalBytesExpectedToSend > 0) {
        callbacks.onProgress?.(Math.min(1, totalBytesSent / totalBytesExpectedToSend));
      }
    },
  );
  const put = await task.uploadAsync();
  if (!put) throw new Error('ההעלאה בוטלה');
  if (put.status < 200 || put.status >= 300) {
    throw new Error(`ההעלאה לאחסון נכשלה (${put.status}) — נסו שוב`);
  }
  callbacks.onUploaded?.();

  // transcription of a 3-minute clip on a cold GPU can take a while
  const result = await postJson<TranscribeResult>('/transcribe', { media_id: ticket.media_id }, 600_000);
  if (result.entitlements) setEntitlements(result.entitlements);
  return result;
}

export interface BurnParams {
  mediaId: string;
  template: string;
  lines: { start: number; end: number; text: string; words: Word[] }[];
  quality: string;
  fontSize: number;
}

interface BurnTicket {
  download_url: string;
  bytes: number;
}

const BURN_TIMEOUT_MS = 600_000;

/**
 * Burn captions in the cloud, then download the MP4 from Cloud Storage with
 * progress. Returns the local file uri.
 */
export async function burnAndDownload(
  params: BurnParams,
  onDownloadProgress?: (fraction: number) => void,
): Promise<string> {
  await ensureCacheDir();
  const ticket = await postJson<BurnTicket>(
    '/burn',
    {
      media_id: params.mediaId,
      template: params.template,
      lines: params.lines,
      quality: params.quality,
      font_size: params.fontSize,
    },
    BURN_TIMEOUT_MS,
  );

  const dest = `${LegacyFS.cacheDirectory}katuvit-${params.mediaId}-${Date.now()}.mp4`;
  const download = LegacyFS.createDownloadResumable(
    ticket.download_url,
    dest,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      const total = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : ticket.bytes;
      if (total > 0) onDownloadProgress?.(Math.min(1, totalBytesWritten / total));
    },
  );
  const result = await download.downloadAsync();
  if (!result) throw new Error('ההורדה בוטלה');
  if (result.status !== 200) throw new Error(`הורדת הסרטון נכשלה (${result.status}) — נסו שוב`);
  return result.uri;
}
