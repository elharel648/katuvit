import type { CaptionTemplate } from './types';

/**
 * The looks. Ids and modes mirror server/transcriber.py TEMPLATES — the server
 * owns the ASS rendering, the client renders the same idea live in the editor.
 */
export const TEMPLATES: CaptionTemplate[] = [
  {
    id: 'bold',
    name: 'בולט',
    mode: 'highlight',
    textColor: '#FFFFFF',
    activeColor: '#FFD52E',
    activeScale: 1,
    outlineColor: '#000000',
    backgroundColor: '#000000E0',
  },
  {
    id: 'reveal',
    name: 'גלישה',
    mode: 'reveal',
    textColor: '#FFFFFF',
    activeColor: '#FFFFFF',
    activeScale: 1,
    outlineColor: '#000000',
    backgroundColor: null,
  },
  {
    id: 'clean',
    name: 'נקי',
    mode: 'highlight',
    textColor: '#FFFFFF',
    activeColor: '#FFD52E',
    activeScale: 1.08,
    outlineColor: '#000000',
    backgroundColor: null,
  },
  {
    id: 'classic',
    name: 'קלאסי',
    mode: 'static',
    textColor: '#FFFFFF',
    activeColor: '#FFFFFF',
    activeScale: 1,
    outlineColor: '#000000',
    backgroundColor: null,
  },
];
