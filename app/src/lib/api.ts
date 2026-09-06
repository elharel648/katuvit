import * as FileSystem from 'expo-file-system/legacy';

import { BURN_URL, DOWNLOAD_URL, KATUVIT_API_KEY, TRANSCRIBE_UPLOAD_URL } from './config';
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
  const res = await FileSystem.uploadAsync(TRANSCRIBE_UPLOAD_URL, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    parameters: { api_key: KATUVIT_API_KEY },
  });

  if (res.status !== 200) {
    throw new Error(`השרת החזיר שגיאה (${res.status})`);
  }
  const data = JSON.parse(res.body);
  if (!data.segments) {
    throw new Error(data.error ?? 'תשובה לא צפויה מהשרת');
  }
  return data as TranscribeResult;
}


export interface BurnParams {
  mediaId: string;
  template: string;
  lines: { start: number; end: number; text: string }[];
  quality: string;
  fontSize: number;
}

/** burn captions in the cloud, download the MP4 locally, return its file uri */
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
  const data = await res.json();
  if (!data.result_id) throw new Error(data.error ?? 'הצריבה נכשלה');

  const target = `${FileSystem.cacheDirectory}katuvit-${data.result_id}.mp4`;
  const dl = await FileSystem.downloadAsync(
    `${DOWNLOAD_URL}?id=${data.result_id}&key=${KATUVIT_API_KEY}`,
    target,
  );
  if (dl.status !== 200) throw new Error('הורדת הסרטון נכשלה');
  return dl.uri;
}
