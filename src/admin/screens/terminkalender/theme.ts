import { SLOTS } from '../../../constants/slots';
import { DE_DAYS_SHORT } from '../../../constants/i18n';

// ─── Design tokens ───────────────────────────────────────────────────────────
export const C = {
  bg:           '#EEF3FB',
  surface:      '#FFFFFF',
  dark:         '#152238',
  navy:         '#152238',
  navyMid:      '#1E2E48',
  text:         '#152238',
  textMid:      '#374151',
  textLight:    '#4A6080',
  textFaint:    '#7A90AE',
  border:       'rgba(21,34,56,0.08)',
  borderLight:  '#EEF3FB',
  accent:       '#5A8C6A',
  accentLight:  'rgba(90,140,106,0.1)',
  accentMid:    'rgba(90,140,106,0.22)',
  todayCol:     'rgba(90,140,106,0.06)',
  danger:       '#EF4444',
  dangerBg:     '#FEF2F2',
  successBg:    '#F0FDF4',
  successText:  '#15803D',
  weekendBg:    'rgba(0,0,0,0.018)',
  pastOpacity:  0.45,
};

// Programmfarbe als 10%-Flaeche hinter den Terminbloecken.
export const PROGRAM_BG: Record<string, string> = {
  individual:          'rgba(74,143,232,0.10)',
  gruppe:              'rgba(61,191,160,0.10)',
  athletik:            'rgba(245,168,74,0.10)',
  torhueter_individual:'rgba(232,118,118,0.10)',
  torhueter_gruppe:    'rgba(155,89,182,0.10)',
};

// ─── Raster-Konstanten ───────────────────────────────────────────────────────
export const DE_DAYS     = DE_DAYS_SHORT;
export const ALL_SLOTS   = SLOTS;
export const TIME_COL_W  = 68;
export const DAY_COL_MIN = 118;
/** Breite der Admin-Sidebar ab dem 768px-Breakpoint (siehe AdminApp). */
export const SIDEBAR_W   = 220;
