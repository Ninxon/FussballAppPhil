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
      style={styles.player}
      useNativeControls
      resizeMode={ResizeMode.CONTAIN}
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
