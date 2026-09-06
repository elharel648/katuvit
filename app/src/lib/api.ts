import { File, Paths } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { BURN_URL, KATUVIT_API_KEY, TRANSCRIBE_UPLOAD_URL } from './config';
import type { TranscriptSegment } from './types';

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
  const res = await LegacyFS.uploadAsync(TRANSCRIBE_UPLOAD_URL, fileUri, {
    httpMethod: 'POST',
    uploadType: LegacyFS.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    parameters: { api_key: KATUVIT_API_KEY },
  });
  if (res.status !== 200) throw new Error(`השרת החזיר שגיאה (${res.status})`);
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
  const res = await fetch(BURN_URL, {
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
  if (!res.ok) throw new Error(`שרת הצריבה החזיר שגיאה (${res.status})`);

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('video')) {
    // server returned a JSON error instead of bytes
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'הצריבה נכשלה');
  }

  const buffer = await res.arrayBuffer();
  const file = new File(Paths.cache, `katuvit-${params.mediaId}.mp4`);
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(buffer));
  return file.uri;
}
