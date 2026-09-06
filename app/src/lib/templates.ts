import type { CaptionTemplate } from './types';

/** v0: visual identity only — the server holds the matching ASS styles */
export const TEMPLATES: CaptionTemplate[] = [
  {
    id: 'classic',
    name: 'קלאסי',
    fontFamily: 'System',
    textColor: '#FFFFFF',
    outlineColor: '#000000',
    backgroundColor: null,
  },
  {
    id: 'boxed',
    name: 'קופסה',
    fontFamily: 'System',
    textColor: '#FFFFFF',
    outlineColor: '#000000',
    backgroundColor: '#000000CC',
  },
  {
    id: 'yellow',
    name: 'צהוב',
    fontFamily: 'System',
    textColor: '#FFE23D',
    outlineColor: '#000000',
    backgroundColor: null,
  },
  {
    id: 'pop',
    name: 'פופ',
    fontFamily: 'System',
    textColor: '#FFFFFF',
    outlineColor: '#E1306C',
    backgroundColor: null,
  },
  {
    id: 'clean',
    name: 'נקי',
    fontFamily: 'System',
    textColor: '#111111',
    outlineColor: '#FFFFFF',
    backgroundColor: '#FFFFFFB0',
  },
];
