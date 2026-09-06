export interface Word {
  /** the word text (trimmed once grouped into lines; raw transcriber words carry a leading space) */
  w: string;
  /** start time in seconds */
  s: number;
  /** end time in seconds */
  e: number;
  /** always coloured in the accent (user emphasis) */
  em?: boolean;
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

/**
 * highlight: whole line shown, spoken word takes the accent colour
 * boxword:   spoken word sits in an accent box with black text
 * fill:      colour sweeps through each word as it is sung
 * neon:      glowing accent outline, spoken word brightens
 * reveal:    words appear as spoken · static: plain
 */
export type CaptionMode = 'highlight' | 'boxword' | 'fill' | 'neon' | 'reveal' | 'static';

export type AccentId = 'yellow' | 'green' | 'pink' | 'cyan' | 'orange' | 'white';
export type FontId = 'rubik' | 'heebo' | 'secular';
export type PositionId = 'bottom' | 'center' | 'top' | 'custom';
export type AnimationId = 'none' | 'pop';

/** everything that shapes the burned captions besides the text itself */
export interface StyleChoice {
  template: string;
  accent: AccentId;
  font: FontId;
  position: PositionId;
  animation: AnimationId;
  /** caption centre as fractions of the video frame — set by dragging (position === 'custom') */
  posX?: number;
  posY?: number;
}

export interface CaptionTemplate {
  id: string;
  name: string;
  mode: CaptionMode;
  textColor: string;
  /** highlight/clean: scale bump of the spoken word in the preview */
  activeScale: number;
  outlineColor: string;
  /** line box behind the whole caption (bold, frame) */
  backgroundColor: string | null;
}
