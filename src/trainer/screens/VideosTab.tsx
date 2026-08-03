import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { TrainerVideo } from '../types';
import { VideoIcon } from '../icons';
import { styles } from '../styles';

export function VideosTab({ videos }: { videos: TrainerVideo[] }) {
  if (videos.length === 0) {
    return (
      <ScrollView contentContainerStyle={[styles.scrollContent, { alignItems: 'center', paddingTop: 60 }]}>
        <View style={{ marginBottom: 16 }}>
          <VideoIcon color="#C4C9D2" size={48} />
        </View>
        <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>Noch keine Videos vorhanden.</Text>
        <Text style={[styles.empty, { textAlign: 'center' }]}>Der Admin kann Videos für dich hinterlegen.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionTitle}>Meine Videos ({videos.length})</Text>
      {videos.map(v => (
        <View key={v.id} style={styles.videoCard}>
          <View style={styles.videoCardBody}>
            <Text style={styles.videoTitle}>{v.title}</Text>
            {v.description ? <Text style={styles.videoDesc}>{v.description}</Text> : null}
          </View>
          <TouchableOpacity
            style={styles.videoOpenBtn}
            onPress={() => Linking.openURL(v.url)}
            activeOpacity={0.7}
          >
            <Text style={styles.videoOpenBtnText}>Öffnen</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}
