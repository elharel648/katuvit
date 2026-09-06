export interface Word {
  /** the word text, as returned by the transcriber (includes leading space) */
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
  /** true once the user manually edited the text */
  edited: boolean;
}

export interface CaptionTemplate {
  id: string;
  name: string;
  fontFamily: string;
  textColor: string;
  outlineColor: string;
  backgroundColor: string | null;
}
