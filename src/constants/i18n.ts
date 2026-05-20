export const DE_MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
export const DE_MONTHS_S = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
export const DE_DAYS_SHORT = ['Mo','Di','Mi','Do','Fr','Sa','So'];
export const DE_DAYS_FULL = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];

export function todayStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fmtDate(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  const dow = DE_DAYS_FULL[(new Date(y, m - 1, d).getDay() + 6) % 7];
  return `${dow}, ${d}. ${DE_MONTHS[m - 1]} ${y}`;
}

export function fmtShort(s: string): string {
  const [, m, d] = s.split('-').map(Number);
  return `${d}. ${DE_MONTHS_S[m - 1]}`;
}
