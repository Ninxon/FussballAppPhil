import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
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
 * Seitenverhaeltnis aus dem Ready-Event lesen.
 *
 * expo-av reicht auf den beiden Plattformen Unterschiedliches durch: nativ ein
 * `naturalSize`-Objekt, im Web den rohen canplay-Event des <video>-Elements
 * (siehe ExponentVideo.web.js). Deshalb beide Formen pruefen.
 */
function readAspect(e: any): number | null {
  const n = e?.naturalSize;
  if (n?.width > 0 && n?.height > 0) {
    // Android meldet die Rohmasse teils vor der Rotation — dann passt die
    // Orientierung nicht zu den Zahlen und wir drehen sie zurueck.
    const flip = n.orientation === 'portrait' && n.width > n.height;
    return flip ? n.height / n.width : n.width / n.height;
  }

  const t = e?.target ?? e?.nativeEvent?.target;
  if (t?.videoWidth > 0 && t?.videoHeight > 0) return t.videoWidth / t.videoHeight;

  return null;
}

// Wiedergabe direkt in der App. Der signierte Link wird ERST beim Aufklappen
// geholt und nicht fuer die ganze Liste vorab: das spart N Roundtrips und
// startet die Vier-Stunden-Frist erst, wenn sie gebraucht wird.
//
// expo-av ist ab SDK 52 zugunsten von expo-video abgeloest. Der Player ist
// deshalb absichtlich auf diese eine Datei begrenzt, damit der spaetere
// Wechsel ein Ein-Datei-Vorgang bleibt.
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
    <Video
      source={{ uri }}
      // Das Seitenverhaeltnis kommt vom Video selbst — fest verdrahtete 16:9
      // gaeben jedem Hochkant-Video vom Handy dicke schwarze Balken.
      style={[styles.player, { aspectRatio: aspect }]}
      useNativeControls
      resizeMode={ResizeMode.CONTAIN}
      onReadyForDisplay={e => {
        const a = readAspect(e);
        // Untergrenze gegen unsinnige Metadaten: schmaler als 1:2 wird der
        // Player im 430px-Layout unbenutzbar hoch.
        if (a && a >= 0.5 && a <= 3) setAspect(a);
      }}
      // Kein shouldPlay: so gibt es keinen Aerger mit den Autoplay-Regeln der
      // Browser, und unterwegs startet nichts ungefragt einen Download.
      onError={() => {
        // Haeufigste Ursache ist ein abgelaufener signierter Link. Einmal neu
        // holen, danach ehrlich scheitern statt in einer Schleife zu haengen.
        if (!retried.current) { retried.current = true; setUri(null); resolve(); }
        else setError('Das Video konnte nicht abgespielt werden.');
      }}
    />
  );
}
