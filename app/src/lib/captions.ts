import type { CaptionLine, CaptionTemplate, TranscriptSegment, Word } from './types';

/** grouping rule — the burn server renders whatever lines we send, so this is the source of truth */
const MAX_WORDS_PER_LINE = 4;
const MAX_LINE_SPAN_SECONDS = 2.4;

export function splitIntoLines(segments: TranscriptSegment[]): CaptionLine[] {
  const words: Word[] = segments.flatMap((s) => s.words);
  const lines: CaptionLine[] = [];
  let current: Word[] = [];

  const flush = () => {
    const trimmed = current
      .map((w) => ({ w: w.w.trim(), s: w.s, e: w.e }))
      .filter((w) => w.w.length > 0);
    if (trimmed.length === 0) {
      current = [];
      return;
    }
    lines.push({
      id: `line-${lines.length}`,
      start: trimmed[0].s,
      end: trimmed[trimmed.length - 1].e,
      // text and words must spell the same thing — the server checks and falls back otherwise
      text: trimmed.map((w) => w.w).join(' '),
      words: trimmed,
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

/**
 * Word timings for an edited line. Same word count as before → keep the spoken
 * timings (typo fixes stay in sync); otherwise spread the new words evenly.
 */
export function retimeWords(
  text: string,
  start: number,
  end: number,
  previous?: Word[],
): Word[] {
  const parts = text.split(/\s+/).filter(Boolean);
  if (previous && previous.length === parts.length) {
    return parts.map((w, i) => ({ w, s: previous[i].s, e: previous[i].e }));
  }
  const step = (end - start) / Math.max(parts.length, 1);
  return parts.map((w, i) => ({ w, s: start + i * step, e: start + (i + 1) * step }));
}

/** index of the word being spoken at time t: a word stays active until the next one starts */
export function activeWordIndex(line: CaptionLine, t: number): number {
  let idx = 0;
  for (let i = 0; i < line.words.length; i++) {
    if (t >= line.words[i].s) idx = i;
  }
  return idx;
}

export interface PreviewWord {
  text: string;
  active: boolean;
}

/** what the live preview shows for a line at time t, per template mode */
export function previewWords(
  line: CaptionLine,
  template: CaptionTemplate,
  t: number,
): PreviewWord[] {
  if (line.words.length === 0) return [{ text: line.text, active: false }];
  const active = activeWordIndex(line, t);
  switch (template.mode) {
    case 'highlight':
    case 'boxword':
    case 'fill':
    case 'neon':
      return line.words.map((w, i) => ({ text: w.w, active: i === active }));
    case 'reveal':
      return line.words.slice(0, active + 1).map((w) => ({ text: w.w, active: false }));
    default:
      return line.words.map((w) => ({ text: w.w, active: false }));
  }
}

/**
 * Base direction of a caption line: the first strong (letter) character decides.
 * Hebrew/Arabic → RTL; an English line is LTR and its words must not be reversed.
 */
export function isRtlText(text: string): boolean {
  const m = text.match(/[\p{L}]/u);
  return m ? /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(m[0]) : true;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
