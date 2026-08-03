// Reine Regeln rund um Video-Uploads: keine Datenbank, kein React, kein
// Supabase-Import — dadurch im Node-Jest-Projekt testbar
// (src/__tests__/videoValidation.test.ts).

/**
 * Harte Obergrenze pro Datei. Entspricht ~5 Minuten in 1080p bei ~5 Mbit/s
 * und blockt versehentlich hochgeladenes 4K-Rohmaterial (~350 MB/Minute).
 * Muss zum file_size_limit des Buckets passen.
 */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/** Enthaltener Speicher im Supabase-Pro-Tarif. Basis der Belegungsanzeige. */
export const STORAGE_QUOTA_BYTES = 100 * 1024 * 1024 * 1024;

export const ALLOWED_VIDEO_MIME = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
] as const;

const ALLOWED_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv'] as const;

export type UploadMode = 'file' | 'url' | 'library';

export type UploadCandidate = {
  title: string;
  mode: UploadMode;
  file?: { name: string; size: number; type: string } | null;
  url?: string;
};

/** '1,4 GB' — deutsche Schreibweise mit Komma. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')} ${units[unit]}`;
}

/**
 * Dateiendung aus dem Originalnamen, auf die erlaubte Liste beschränkt.
 * Verhindert, dass ein manipulierter Name den Objektpfad bestimmt.
 */
export function safeExtension(filename: string): string {
  const raw = filename.split('.').pop()?.toLowerCase().trim() ?? '';
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(raw) ? raw : 'mp4';
}

/** null = in Ordnung, sonst die fertige deutsche Fehlermeldung. */
export function validateVideoUpload(input: UploadCandidate): string | null {
  if (!input.title.trim()) return 'Bitte einen Titel eingeben.';

  if (input.mode === 'url') {
    const url = (input.url ?? '').trim();
    if (!url) return 'Bitte eine URL eingeben.';
    if (!/^https?:\/\/.+/i.test(url)) return 'Die URL muss mit http:// oder https:// beginnen.';
    return null;
  }

  if (input.mode === 'library') return null;

  const file = input.file;
  if (!file) return 'Bitte eine Videodatei auswählen.';
  if (file.size <= 0) return 'Die Datei ist leer.';
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Die Datei ist ${formatBytes(file.size)} groß. Erlaubt sind maximal `
      + `${formatBytes(MAX_UPLOAD_BYTES)} — bitte vorher auf 1080p (ca. 5 Mbit/s) exportieren.`;
  }
  // Der Typ ist bei manchen Browsern leer; dann entscheidet die Endung.
  if (file.type && !(ALLOWED_VIDEO_MIME as readonly string[]).includes(file.type)) {
    return 'Nicht unterstütztes Format. Erlaubt sind MP4, WebM, MOV, AVI und MKV.';
  }
  return null;
}

/** Ampel für die Belegungsanzeige. */
export function storageLevel(usedBytes: number, quotaBytes = STORAGE_QUOTA_BYTES): 'ok' | 'warn' | 'critical' {
  if (quotaBytes <= 0) return 'ok';
  const share = usedBytes / quotaBytes;
  if (share >= 0.9) return 'critical';
  if (share >= 0.7) return 'warn';
  return 'ok';
}

/**
 * Objektpfad in der Bibliothek. Aus der Video-Id abgeleitet (nicht aus
 * Trainer + Zeitstempel wie früher), damit Zeile und Datei eindeutig
 * zusammengehören und Verwaiste exakt erkennbar sind.
 */
export function libraryStoragePath(videoId: string, filename: string): string {
  return `library/${videoId}.${safeExtension(filename)}`;
}
