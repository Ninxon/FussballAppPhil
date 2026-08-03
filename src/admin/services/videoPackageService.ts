import { supabase } from '../../lib/supabase';
import { AdminVideoPackage, VideoAsset, VideoStorageUsage } from '../../types';
import { VIDEO_BUCKET } from '../../services/videoService';
import { libraryStoragePath } from './videoValidation';

// Sämtliches I/O rund um Video-Pakete: Datenbank UND Storage. Die reinen
// Regeln liegen daneben in videoValidation.ts (dort ohne supabase-Import,
// damit sie im Node-Jest-Projekt testbar bleiben).

/**
 * Diskriminierte Union über das Literal `ok` — nicht über `error: string|null`,
 * denn `string` ist kein Literaltyp und TypeScript könnte den Erfolgsfall dann
 * nicht verengen (`data` bliebe überall `T | null`).
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const succeed = <T>(data: T): { ok: true; data: T } => ({ ok: true, data });

const msg = (e: unknown, fallback: string): string =>
  (e as { message?: string } | null)?.message ?? fallback;

/** crypto.randomUUID fehlt in Hermes — daher mit Rückfalllösung. */
export function newVideoId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Lesen ──────────────────────────────────────────────────────────────────

/** Alle Pakete inkl. Videos und Trainer-Zuweisung (Admin-Sicht). */
export async function fetchPackages(): Promise<Result<AdminVideoPackage[]>> {
  const { data, error } = await supabase
    .from('video_packages')
    .select(`
      id, title, description, created_at,
      video_package_items ( position, videos ( id, title, description, url, storage_path, mime_type, size_bytes, original_filename, created_at ) ),
      video_package_trainers ( trainer_id )
    `)
    .order('created_at', { ascending: false });

  if (error) return fail(msg(error, 'Pakete konnten nicht geladen werden.'));

  const packages: AdminVideoPackage[] = (data ?? []).map((p: any) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    created_at: p.created_at,
    videos: (p.video_package_items ?? [])
      .slice()
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      .map((i: any) => i.videos)
      .filter(Boolean) as VideoAsset[],
    trainerIds: (p.video_package_trainers ?? []).map((t: any) => t.trainer_id),
  }));

  return succeed(packages);
}

/** Die gesamte Bibliothek — Grundlage für „Aus Bibliothek hinzufügen". */
export async function fetchLibrary(): Promise<Result<VideoAsset[]>> {
  const { data, error } = await supabase
    .from('videos')
    .select('id, title, description, url, storage_path, mime_type, size_bytes, original_filename, created_at')
    .order('created_at', { ascending: false });

  if (error) return fail(msg(error, 'Bibliothek konnte nicht geladen werden.'));
  return succeed((data ?? []) as VideoAsset[]);
}

export async function fetchStorageUsage(): Promise<Result<VideoStorageUsage>> {
  const { data, error } = await supabase.rpc('get_video_storage_usage');
  if (error) return fail(msg(error, 'Speicherbelegung konnte nicht ermittelt werden.'));
  return succeed(data as VideoStorageUsage);
}

/** In wie vielen Paketen liegt welches Video? Für Lösch-Hinweise. */
export async function fetchPackageCountsByVideo(): Promise<Result<Record<string, number>>> {
  const { data, error } = await supabase.from('video_package_items').select('video_id');
  if (error) return fail(msg(error, 'Paket-Zuordnungen konnten nicht geladen werden.'));
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { video_id: string }[]) {
    counts[row.video_id] = (counts[row.video_id] ?? 0) + 1;
  }
  return succeed(counts);
}

// ── Pakete ─────────────────────────────────────────────────────────────────

export async function createPackage(title: string, description: string | null): Promise<Result<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('video_packages')
    .insert({ title: title.trim(), description: description?.trim() || null, created_by: user?.id ?? null })
    .select('id')
    .single();

  if (error) return fail(msg(error, 'Paket konnte nicht angelegt werden.'));
  return succeed(data.id as string);
}

export async function updatePackage(
  packageId: string, fields: { title?: string; description?: string | null },
): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.title !== undefined) patch.title = fields.title.trim();
  if (fields.description !== undefined) patch.description = fields.description?.trim() || null;

  const { error } = await supabase.from('video_packages').update(patch).eq('id', packageId);
  return { error: error ? msg(error, 'Paket konnte nicht gespeichert werden.') : null };
}

/**
 * Löscht nur das Paket. Videos und Dateien bleiben in der Bibliothek —
 * die Zuweisungen und Inhalts-Zeilen räumt der ON-DELETE-CASCADE ab.
 */
export async function deletePackage(packageId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('video_packages').delete().eq('id', packageId);
  return { error: error ? msg(error, 'Paket konnte nicht gelöscht werden.') : null };
}

/** Kopie mit denselben Videos, aber ohne Zuweisungen — Startpunkt für Varianten. */
export async function duplicatePackage(source: AdminVideoPackage): Promise<Result<string>> {
  const created = await createPackage(`${source.title} (Kopie)`, source.description);
  if (!created.ok) return created;

  if (source.videos.length > 0) {
    const { error } = await supabase.from('video_package_items').insert(
      source.videos.map((v, i) => ({ package_id: created.data, video_id: v.id, position: i })),
    );
    if (error) {
      // Halb kopiertes Paket wieder entfernen, statt es zurückzulassen.
      await supabase.from('video_packages').delete().eq('id', created.data);
      return fail(msg(error, 'Videos konnten nicht kopiert werden.'));
    }
  }
  return created;
}

// ── Paketinhalt ────────────────────────────────────────────────────────────

export async function addVideoToPackage(
  packageId: string, videoId: string, position: number,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('video_package_items')
    .insert({ package_id: packageId, video_id: videoId, position });
  if (error?.code === '23505') return { error: 'Dieses Video liegt bereits im Paket.' };
  return { error: error ? msg(error, 'Video konnte dem Paket nicht hinzugefügt werden.') : null };
}

/** Entfernt nur die Zuordnung. Datei und Bibliothekseintrag bleiben. */
export async function removeVideoFromPackage(
  packageId: string, videoId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('video_package_items')
    .delete()
    .eq('package_id', packageId)
    .eq('video_id', videoId);
  return { error: error ? msg(error, 'Video konnte nicht aus dem Paket entfernt werden.') : null };
}

export async function reorderPackageVideos(
  packageId: string, orderedVideoIds: string[],
): Promise<{ error: string | null }> {
  for (let i = 0; i < orderedVideoIds.length; i++) {
    const { error } = await supabase
      .from('video_package_items')
      .update({ position: i })
      .eq('package_id', packageId)
      .eq('video_id', orderedVideoIds[i]);
    if (error) return { error: msg(error, 'Reihenfolge konnte nicht gespeichert werden.') };
  }
  return { error: null };
}

// ── Verteilung ─────────────────────────────────────────────────────────────

/**
 * Setzt die Trainer-Zuweisung eines Pakets auf genau `trainerIds` und
 * schreibt dabei nur die Differenz. Eine entfernte Zuweisung nimmt lediglich
 * den Zugriff — Paket und Videos bleiben unberührt.
 */
export async function setPackageTrainers(
  packageId: string, trainerIds: string[], currentIds: string[],
): Promise<{ error: string | null }> {
  const toAdd = trainerIds.filter(id => !currentIds.includes(id));
  const toRemove = currentIds.filter(id => !trainerIds.includes(id));

  if (toAdd.length > 0) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('video_package_trainers').insert(
      toAdd.map(trainer_id => ({ package_id: packageId, trainer_id, assigned_by: user?.id ?? null })),
    );
    if (error) return { error: msg(error, 'Zuweisung konnte nicht gespeichert werden.') };
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('video_package_trainers')
      .delete()
      .eq('package_id', packageId)
      .in('trainer_id', toRemove);
    if (error) return { error: msg(error, 'Zuweisung konnte nicht entfernt werden.') };
  }

  return { error: null };
}

// ── Videos (Bibliothek) ────────────────────────────────────────────────────

/**
 * Lädt eine Datei hoch und legt den Bibliothekseintrag an.
 *
 * Scheitert der Insert nach erfolgreichem Upload, wird die Datei wieder
 * entfernt — sonst bliebe sie als Leiche im Bucket liegen (genau das Leck
 * des bisherigen TrainerVideosScreen).
 */
export async function uploadVideo(params: {
  title: string;
  description: string | null;
  file: File;
}): Promise<Result<VideoAsset>> {
  const id = newVideoId();
  const path = libraryStoragePath(id, params.file.name);

  const { error: uploadError } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(path, params.file, { contentType: params.file.type || undefined, upsert: false });

  if (uploadError) return fail(`Upload fehlgeschlagen: ${uploadError.message}`);

  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('videos')
    .insert({
      id,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      url: null,
      storage_path: path,
      mime_type: params.file.type || null,
      size_bytes: params.file.size,
      original_filename: params.file.name,
      created_by: user?.id ?? null,
    })
    .select('id, title, description, url, storage_path, mime_type, size_bytes, original_filename, created_at')
    .single();

  if (error) {
    await supabase.storage.from(VIDEO_BUCKET).remove([path]);
    return fail(msg(error, 'Video konnte nicht gespeichert werden.'));
  }

  return succeed(data as VideoAsset);
}

/** Externer Link — belegt keinen Speicher. */
export async function createLinkVideo(params: {
  title: string;
  description: string | null;
  url: string;
}): Promise<Result<VideoAsset>> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('videos')
    .insert({
      title: params.title.trim(),
      description: params.description?.trim() || null,
      url: params.url.trim(),
      storage_path: null,
      created_by: user?.id ?? null,
    })
    .select('id, title, description, url, storage_path, mime_type, size_bytes, original_filename, created_at')
    .single();

  if (error) return fail(msg(error, 'Video konnte nicht gespeichert werden.'));
  return succeed(data as VideoAsset);
}

/**
 * Löscht das Video endgültig: erst die Datei, dann den Bibliothekseintrag.
 * Scheitert das Entfernen der Datei, wird abgebrochen — sonst entstünde eine
 * Leiche ohne zugehörige Zeile.
 */
export async function deleteVideo(video: VideoAsset): Promise<{ error: string | null }> {
  if (video.storage_path) {
    const { error } = await supabase.storage.from(VIDEO_BUCKET).remove([video.storage_path]);
    if (error) return { error: `Datei konnte nicht gelöscht werden: ${error.message}` };
  }
  const { error } = await supabase.from('videos').delete().eq('id', video.id);
  return { error: error ? msg(error, 'Video konnte nicht gelöscht werden.') : null };
}

/**
 * Entfernt Dateien im Bucket, zu denen es keine videos-Zeile mehr gibt —
 * Altlasten abgebrochener Uploads und der Edge Function delete-trainer.
 */
export async function cleanupOrphans(): Promise<Result<number>> {
  const { data: rows, error: dbError } = await supabase
    .from('videos')
    .select('storage_path')
    .not('storage_path', 'is', null);
  if (dbError) return fail(msg(dbError, 'Bibliothek konnte nicht gelesen werden.'));

  const known = new Set((rows ?? []).map((r: { storage_path: string }) => r.storage_path));

  // Der Bucket ist nach Präfix organisiert; 'library/' ist der neue Pfad,
  // die Alt-Uploads liegen unter der jeweiligen Trainer-Id.
  const orphans: string[] = [];
  const prefixes = ['library', ...new Set(
    [...known].map(p => p.split('/')[0]).filter(p => p !== 'library'),
  )];

  for (const prefix of prefixes) {
    const { data: objects, error } = await supabase.storage
      .from(VIDEO_BUCKET)
      .list(prefix, { limit: 1000 });
    if (error) return fail(msg(error, 'Bucket konnte nicht gelesen werden.'));
    for (const obj of objects ?? []) {
      const full = `${prefix}/${obj.name}`;
      if (!known.has(full)) orphans.push(full);
    }
  }

  if (orphans.length === 0) return succeed(0);

  for (let i = 0; i < orphans.length; i += 100) {
    const { error } = await supabase.storage.from(VIDEO_BUCKET).remove(orphans.slice(i, i + 100));
    if (error) return fail(msg(error, 'Verwaiste Dateien konnten nicht entfernt werden.'));
  }
  return succeed(orphans.length);
}
