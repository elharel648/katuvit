export interface Word {
  /** the word text (trimmed once grouped into lines; raw transcriber words carry a leading space) */
  w: string;
  /** start time in seconds */
  s: number;
  /** end time in seconds */
  e: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words: Word[];
}

export interface CaptionLine {
  id: string;
  start: number;
  end: number;
  text: string;
  /** per-word timings — drive the karaoke burn and the live preview */
  words: Word[];
  /** true once the user manually edited the text */
  edited: boolean;
}

/** highlight: whole line shown, spoken word lights up · reveal: words appear as spoken · static: plain */
export type CaptionMode = 'highlight' | 'reveal' | 'static';

export interface CaptionTemplate {
  id: string;
  name: string;
  mode: CaptionMode;
  textColor: string;
  /** colour of the word being spoken (highlight mode) */
  activeColor: string;
  /** highlight mode only: scale bump of the spoken word in the preview */
  activeScale: number;
  outlineColor: string;
  backgroundColor: string | null;
}
