import type { CaptionLine, TranscriptSegment, Word } from './types';

/** mirrors the server-side grouping in burn.py — keep the two in sync */
const MAX_WORDS_PER_LINE = 4;
const MAX_LINE_SPAN_SECONDS = 2.4;

export function splitIntoLines(segments: TranscriptSegment[]): CaptionLine[] {
  const words: Word[] = segments.flatMap((s) => s.words);
  const lines: CaptionLine[] = [];
  let current: Word[] = [];

  const flush = () => {
    if (current.length === 0) return;
    lines.push({
      id: `line-${lines.length}`,
      start: current[0].s,
      end: current[current.length - 1].e,
      text: current
        .map((w) => w.w)
        .join('')
        .trim(),
      edited: false,
    });
    current = [];
  };

  for (const word of words) {
    const spanExceeded =
      current.length > 0 && word.e - current[0].s > MAX_LINE_SPAN_SECONDS;
    if (current.length >= MAX_WORDS_PER_LINE || spanExceeded) flush();
    current.push(word);
  }
  flush();
  return lines;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
