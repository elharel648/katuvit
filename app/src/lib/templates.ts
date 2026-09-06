import type { AccentId, AnimationId, CaptionTemplate, FontId, PositionId, StyleChoice } from './types';

/**
 * The looks. Ids and modes mirror server/captions.py TEMPLATES — the server owns
 * the ASS rendering; the client renders the same idea live in the editor.
 */
export const TEMPLATES: CaptionTemplate[] = [
  { id: 'bold',    name: 'בולט',       mode: 'highlight', textColor: '#FFFFFF', activeScale: 1,    outlineColor: '#000000', backgroundColor: '#000000E0' },
  { id: 'boxword', name: 'קופסה',      mode: 'boxword',   textColor: '#FFFFFF', activeScale: 1,    outlineColor: '#000000', backgroundColor: null },
  { id: 'fill',    name: 'קריוקי',     mode: 'fill',      textColor: '#FFFFFF', activeScale: 1,    outlineColor: '#000000', backgroundColor: null },
  { id: 'neon',    name: 'ניאון',      mode: 'neon',      textColor: '#FFFFFF', activeScale: 1.04, outlineColor: '#000000', backgroundColor: null },
  { id: 'reveal',  name: 'גלישה',      mode: 'reveal',    textColor: '#FFFFFF', activeScale: 1,    outlineColor: '#000000', backgroundColor: null },
  { id: 'clean',   name: 'נקי',        mode: 'highlight', textColor: '#FFFFFF', activeScale: 1.08, outlineColor: '#000000', backgroundColor: null },
  { id: 'frame',   name: 'מסגרת',      mode: 'highlight', textColor: '#111111', activeScale: 1,    outlineColor: '#FFFFFF', backgroundColor: '#FFFFFFEF' },
  { id: 'classic', name: 'קלאסי',      mode: 'static',    textColor: '#FFFFFF', activeScale: 1,    outlineColor: '#000000', backgroundColor: null },
];

export const ACCENTS: { id: AccentId; name: string; hex: string }[] = [
  { id: 'yellow', name: 'צהוב', hex: '#FFD52E' },
  { id: 'green',  name: 'ירוק', hex: '#4AF060' },
  { id: 'pink',   name: 'ורוד', hex: '#FF4FA3' },
  { id: 'cyan',   name: 'תכלת', hex: '#4AD8FF' },
  { id: 'orange', name: 'כתום', hex: '#FF8A2E' },
  { id: 'white',  name: 'לבן',  hex: '#FFFFFF' },
];

/** RN font families for the live preview (loaded in the root layout) */
export const FONTS: { id: FontId; name: string; family: string }[] = [
  { id: 'rubik',   name: 'Rubik',       family: 'Rubik_700Bold' },
  { id: 'heebo',   name: 'Heebo',       family: 'Heebo_700Bold' },
  { id: 'secular', name: 'Secular One', family: 'SecularOne_400Regular' },
];

export const POSITIONS: { id: PositionId; name: string }[] = [
  { id: 'bottom', name: 'למטה' },
  { id: 'center', name: 'באמצע' },
  { id: 'top',    name: 'למעלה' },
];

export const ANIMATIONS: { id: AnimationId; name: string }[] = [
  { id: 'none', name: 'שקט' },
  { id: 'pop',  name: 'קפיצה' },
];

export const DEFAULT_STYLE: StyleChoice = {
  template: 'bold',
  accent: 'yellow',
  font: 'rubik',
  position: 'bottom',
  animation: 'none',
};

export function accentHex(id: AccentId): string {
  return ACCENTS.find((a) => a.id === id)?.hex ?? ACCENTS[0].hex;
}

export function fontFamily(id: FontId): string {
  return FONTS.find((f) => f.id === id)?.family ?? FONTS[0].family;
}
