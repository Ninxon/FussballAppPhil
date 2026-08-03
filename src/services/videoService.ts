import { supabase } from '../lib/supabase';
import { VideoAsset } from '../types';

export const VIDEO_BUCKET = 'trainer-videos';

/** Gültigkeitsdauer signierter Links: lang genug für eine Trainingseinheit. */
const SIGNED_URL_TTL_SECONDS = 4 * 60 * 60;

/**
 * Liefert die abspielbare Adresse eines Videos.
 *
 * Liegt die Datei im Storage, wird ein signierter Link erzeugt; ein externer
 * Link wird unverändert durchgereicht. Weil `storage_path` zuerst geprüft
 * wird, funktioniert die Wiedergabe unverändert, sobald der Bucket von
 * öffentlich auf privat umgestellt wird.
 */
export async function resolvePlaybackUrl(
  video: Pick<VideoAsset, 'url' | 'storage_path'>,
): Promise<{ url: string | null; error: string | null }> {
  if (!video.storage_path) {
    return video.url
      ? { url: video.url, error: null }
      : { url: null, error: 'Für dieses Video ist keine Quelle hinterlegt.' };
  }

  const { data, error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .createSignedUrl(video.storage_path, SIGNED_URL_TTL_SECONDS);

  if (error) return { url: null, error: `Video konnte nicht geöffnet werden: ${error.message}` };
  return { url: data?.signedUrl ?? null, error: data?.signedUrl ? null : 'Video konnte nicht geöffnet werden.' };
}
