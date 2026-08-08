import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { TrainerVideo } from '../../types';
import { resolvePlaybackUrl } from '../../../services/videoService';
import { styles } from '../../styles';

interface Props {
  /** Immer ein hochgeladenes Video — externe Links kann der Player nicht abspielen. */
  video: TrainerVideo;
  /** Notausgang: im Browser oeffnen, wenn die Wiedergabe scheitert. */
  onFallbackOpen: () => void;
}

/** Bis die echten Maße bekannt sind — die meisten Trainingsvideos sind Querformat. */
const FALLBACK_ASPECT = 16 / 9;

/**
 * Untergrenze gegen unsinnige Metadaten: schmaler als 1:2 wird der Player im
 * 430px-Layout unbenutzbar hoch, breiter als 3:1 bleibt nur ein Schlitz.
 */
function isSaneAspect(a: number): boolean {
  return Number.isFinite(a) && a >= 0.5 && a <= 3;
}

// Wiedergabe direkt in der App. Der signierte Link wird ERST beim Aufklappen
// geholt und nicht fuer die ganze Liste vorab: das spart N Roundtrips und
// startet die Vier-Stunden-Frist erst, wenn sie gebraucht wird.
//
// Der Player ist absichtlich auf diese eine Datei begrenzt — der Wechsel von
// expo-av auf expo-video (ab SDK 54 ist expo-av raus) blieb dadurch ein
// Ein-Datei-Vorgang.
export function VideoPlayer({ video, onFallbackOpen }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [aspect, setAspect] = useState(FALLBACK_ASPECT);
  const retried = useRef(false);

  const resolve = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await resolvePlaybackUrl(video);
    setLoading(false);
    if (res.error || !res.url) { setError(res.error ?? 'Video konnte nicht geladen werden.'); return; }
    setUri(res.url);
  }, [video.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { retried.current = false; resolve(); }, [resolve]);

  // Muss vor den fruehen Returns stehen, damit die Hook-Reihenfolge stabil
  // bleibt. `null` als Quelle ist erlaubt und laesst den Player leer.
  const player = useVideoPlayer(uri ? { uri } : null);

  useEffect(() => {
    // Haeufigste Fehlerursache ist ein abgelaufener signierter Link. Einmal neu
    // holen, danach ehrlich scheitern statt in einer Schleife zu haengen.
    const status = player.addListener('statusChange', ({ status: s }) => {
      if (s !== 'error') return;
      if (!retried.current) { retried.current = true; setUri(null); resolve(); }
      else setError('Das Video konnte nicht abgespielt werden.');
    });

    // Das Seitenverhaeltnis kommt vom Video selbst — fest verdrahtete 16:9
    // gaeben jedem Hochkant-Video vom Handy dicke schwarze Balken. Nativ
    // liefert expo-video die bereits rotationsbereinigten Track-Masse.
    const load = player.addListener('sourceLoad', ({ availableVideoTracks }) => {
      const size = availableVideoTracks[0]?.size;
      if (!size?.width || !size?.height) return;
      const a = size.width / size.height;
      if (isSaneAspect(a)) setAspect(a);
    });

    return () => { status.remove(); load.remove(); };
  }, [player, resolve]);

  useEffect(() => {
    // Im Web meldet expo-video `availableVideoTracks` grundsaetzlich leer
    // (siehe VideoPlayer.web.js: "Not supported on web"), das sourceLoad-Event
    // traegt die Masse dort also nicht. Deshalb die Metadaten separat an einem
    // losgeloesten <video> abgreifen — `preload="metadata"` laedt nur den Kopf
    // der Datei, nicht den Stream.
    if (Platform.OS !== 'web' || !uri) return;

    let cancelled = false;
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      if (cancelled) return;
      const a = probe.videoWidth / probe.videoHeight;
      if (isSaneAspect(a)) setAspect(a);
    };
    probe.src = uri;

    return () => { cancelled = true; probe.src = ''; };
  }, [uri]);

  if (loading) {
    return <View style={styles.playerBox}><ActivityIndicator color="#4A7FD4" /></View>;
  }

  if (error || !uri) {
    return (
      <View style={styles.playerBox}>
        <Text style={styles.errorText}>{error ?? 'Video konnte nicht geladen werden.'}</Text>
        <TouchableOpacity style={styles.videoOpenBtn} onPress={onFallbackOpen} activeOpacity={0.7}>
          <Text style={styles.videoOpenBtnText}>Extern öffnen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <VideoView
      player={player}
      style={[styles.player, { aspectRatio: aspect }]}
      contentFit="contain"
      nativeControls
      // Kein player.play(): so gibt es keinen Aerger mit den Autoplay-Regeln
      // der Browser, und unterwegs startet nichts ungefragt einen Download.
    />
  );
}
