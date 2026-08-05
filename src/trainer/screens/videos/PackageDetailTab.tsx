import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { TrainerVideo, TrainerVideoPackage } from '../../types';
import { resolvePlaybackUrl } from '../../../services/videoService';
import { VideoPlayer } from './VideoPlayer';
import { styles } from '../../styles';

interface Props {
  pkg: TrainerVideoPackage;
  onBack: () => void;
}

// Videos eines Pakets. Hochgeladene Dateien laufen im eingebetteten Player,
// externe Links weiterhin im Browser — der Diskriminator ist storage_path,
// dieselbe Regel wie in resolvePlaybackUrl.
export function PackageDetailTab({ pkg, onBack }: Props) {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (video: TrainerVideo) => {
    setOpeningId(video.id);
    setError(null);
    const { url, error: err } = await resolvePlaybackUrl(video);
    setOpeningId(null);
    if (err || !url) { setError(err ?? 'Video konnte nicht geöffnet werden.'); return; }
    Linking.openURL(url);
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={{ marginBottom: 16 }}>
        <Text style={styles.backLink}>‹ Alle Pakete</Text>
      </TouchableOpacity>

      <Text style={styles.packageDetailTitle}>{pkg.title}</Text>
      {pkg.scheduledTime && <Text style={styles.packageDetailTime}>Beginn: {pkg.scheduledTime} Uhr</Text>}
      {pkg.description ? <Text style={styles.packageDetailDesc}>{pkg.description}</Text> : null}
      <Text style={styles.sectionTitle}>
        {pkg.videos.length} {pkg.videos.length === 1 ? 'Video' : 'Videos'}
      </Text>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {pkg.videos.length === 0 ? (
        <Text style={styles.empty}>In diesem Paket liegen noch keine Videos.</Text>
      ) : (
        pkg.videos.map((v, i) => (
          <View key={v.id}>
            <View style={styles.videoCard}>
              <View style={styles.videoCardBody}>
                <Text style={styles.videoTitle}>{i + 1}. {v.title}</Text>
                {v.description ? <Text style={styles.videoDesc}>{v.description}</Text> : null}
              </View>

              {v.storage_path ? (
                // Hochgeladen -> im Player. Immer nur EINES offen, sonst
                // laufen mehrere Streams parallel.
                <TouchableOpacity
                  style={styles.videoOpenBtn}
                  onPress={() => setPlayingId(id => (id === v.id ? null : v.id))}
                  activeOpacity={0.7}
                >
                  <Text style={styles.videoOpenBtnText}>
                    {playingId === v.id ? 'Schließen' : 'Abspielen'}
                  </Text>
                </TouchableOpacity>
              ) : (
                // Externer Link (YouTube/Vimeo): das kann kein HTML5-Player,
                // also weiterhin im Browser oeffnen.
                <TouchableOpacity
                  style={[styles.videoOpenBtn, openingId === v.id && { opacity: 0.6 }]}
                  onPress={() => open(v)}
                  disabled={openingId === v.id}
                  activeOpacity={0.7}
                >
                  {openingId === v.id
                    ? <ActivityIndicator size="small" color="#4A7FD4" />
                    : <Text style={styles.videoOpenBtnText}>Öffnen</Text>}
                </TouchableOpacity>
              )}
            </View>

            {playingId === v.id && (
              <VideoPlayer video={v} onFallbackOpen={() => open(v)} />
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}
