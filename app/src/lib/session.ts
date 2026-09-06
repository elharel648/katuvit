import type { TranscriptSegment } from './types';

/**
 * In-memory session state for the current editing flow.
 * MVP-simple: one video at a time, no persistence.
 */
interface EditingSession {
  videoUri: string;
  segments: TranscriptSegment[];
  duration: number;
}

let current: EditingSession | null = null;

export function startSession(session: EditingSession) {
  current = session;
}

export function getSession(): EditingSession | null {
  return current;
}
