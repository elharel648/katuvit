import * as FileSystem from 'expo-file-system/legacy';

import { KATUVIT_API_KEY, TRANSCRIBE_UPLOAD_URL } from './config';
import type { TranscriptSegment } from './types';

export interface TranscribeResult {
  segments: TranscriptSegment[];
  duration: number;
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
