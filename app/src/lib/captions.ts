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

/** rebuild a line's text from its words (text and words must always agree) */
export function retext(line: CaptionLine): CaptionLine {
  return { ...line, text: line.words.map((w) => w.w).join(' ') };
}

export function deleteLine(lines: CaptionLine[], id: string): CaptionLine[] {
  return lines.filter((l) => l.id !== id);
}

/** split a line into two at word index `at` (words[at] starts the second line) */
export function splitLine(lines: CaptionLine[], id: string, at?: number): CaptionLine[] {
  const idx = lines.findIndex((l) => l.id === id);
  if (idx < 0) return lines;
  const line = lines[idx];
  const cut = at ?? Math.ceil(line.words.length / 2);
  if (line.words.length < 2 || cut <= 0 || cut >= line.words.length) return lines;
  const a = line.words.slice(0, cut);
  const b = line.words.slice(cut);
  const first = retext({ ...line, id: `${line.id}a`, end: a[a.length - 1].e, words: a, edited: true });
  const second = retext({ ...line, id: `${line.id}b`, start: b[0].s, words: b, edited: true });
  return [...lines.slice(0, idx), first, second, ...lines.slice(idx + 1)];
}

/** merge a line with the one after it */
export function mergeWithNext(lines: CaptionLine[], id: string): CaptionLine[] {
  const idx = lines.findIndex((l) => l.id === id);
  if (idx < 0 || idx >= lines.length - 1) return lines;
  const a = lines[idx];
  const b = lines[idx + 1];
  const merged = retext({ ...a, end: b.end, words: [...a.words, ...b.words], edited: true });
  return [...lines.slice(0, idx), merged, ...lines.slice(idx + 2)];
}

/** shift a whole line (and its words) by `delta` seconds; never before 0 */
export function nudgeLine(lines: CaptionLine[], id: string, delta: number): CaptionLine[] {
  return lines.map((l) => {
    if (l.id !== id) return l;
    const d = Math.max(delta, -l.start);
    return {
      ...l,
      start: l.start + d,
      end: l.end + d,
      words: l.words.map((w) => ({ ...w, s: w.s + d, e: w.e + d })),
      edited: true,
    };
  });
}

/** lengthen or shorten how long a line stays on screen; word timings stretch with it */
export function adjustLineDuration(lines: CaptionLine[], id: string, delta: number): CaptionLine[] {
  return lines.map((l) => {
    if (l.id !== id) return l;
    const newEnd = Math.max(l.start + 0.4, l.end + delta);
    const oldSpan = Math.max(l.end - l.start, 0.001);
    const k = (newEnd - l.start) / oldSpan;
    return {
      ...l,
      end: newEnd,
      edited: true,
      words: l.words.map((w) => ({ ...w, s: l.start + (w.s - l.start) * k, e: l.start + (w.e - l.start) * k })),
    };
  });
}

export function toggleEmphasis(lines: CaptionLine[], id: string, wordIndex: number): CaptionLine[] {
  return lines.map((l) =>
    l.id === id
      ? { ...l, edited: true, words: l.words.map((w, i) => (i === wordIndex ? { ...w, em: !w.em } : w)) }
      : l,
  );
}

/** attach or remove an emoji after a word (it becomes part of the burned text) */
export function toggleEmoji(lines: CaptionLine[], id: string, wordIndex: number, emoji: string): CaptionLine[] {
  return lines.map((l) => {
    if (l.id !== id) return l;
    const words = l.words.map((w, i) => {
      if (i !== wordIndex) return w;
      const has = w.w.endsWith(emoji);
      return { ...w, w: has ? w.w.slice(0, -emoji.length).trimEnd() : `${w.w} ${emoji}` };
    });
    return retext({ ...l, words, edited: true });
  });
}

/** spoken tics people don't want on screen; one tap removes them everywhere */
const FILLERS = new Set(['כאילו', 'יעני', 'בעצם', 'אוקיי', 'אה', 'אהה', 'אמ', 'אממ', 'המ', 'like', 'um', 'uh', 'okay', 'ok']);

export function removeFillers(lines: CaptionLine[]): { lines: CaptionLine[]; removed: number } {
  let removed = 0;
  const out: CaptionLine[] = [];
  for (const l of lines) {
    const kept = l.words.filter((w) => {
      const bare = w.w.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
      const drop = FILLERS.has(bare);
      if (drop) removed += 1;
      return !drop;
    });
    if (kept.length === 0) continue;
    if (kept.length === l.words.length) out.push(l);
    else out.push(retext({ ...l, words: kept, start: kept[0].s, end: kept[kept.length - 1].e, edited: true }));
  }
  return { lines: out, removed };
}

/** keyword → emoji suggestions (Hebrew + a little English); shown as a chip the user can accept */
const EMOJI_HINTS: [RegExp, string][] = [
  [/אהב|אוהב|לב|love/i, '❤️'],
  [/כסף|שקל|לשלם|מחיר|money|₪/i, '💰'],
  [/זמן|שעה|דקה|רגע|time/i, '⏰'],
  [/אוכל|לאכול|טעים|food|pizza/i, '🍕'],
  [/קפה|coffee/i, '☕'],
  [/עבודה|משרד|work/i, '💼'],
  [/בית|home/i, '🏠'],
  [/רעיון|חשבתי|idea/i, '💡'],
  [/מדהים|וואו|מטורף|wow|amazing/i, '🤯'],
  [/צחוק|מצחיק|lol|haha/i, '😂'],
  [/סרטון|וידאו|video|camera/i, '🎬'],
  [/מוזיקה|שיר|music/i, '🎵'],
  [/ספורט|כושר|gym/i, '💪'],
  [/ילד|ילדה|תינוק|baby/i, '👶'],
  [/שמח|שמחה|happy/i, '😊'],
  [/אש|חם|fire/i, '🔥'],
  [/כן|נכון|yes|right/i, '✅'],
  [/לא|אסור|no\b/i, '❌'],
  [/שאלה|למה|\?/i, '❓'],
  [/טלפון|phone/i, '📱'],
];

export function suggestEmoji(word: string): string | null {
  const bare = word.replace(/[^\p{L}\p{N}?]/gu, '');
  for (const [re, emoji] of EMOJI_HINTS) if (re.test(bare)) return emoji;
  return null;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
