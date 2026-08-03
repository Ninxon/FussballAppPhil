import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { TrainerVideoPackage } from '../types';
import { VideoIcon } from '../icons';
import { fmtDateShort } from '../../utils/date';
import { PackageDetailTab } from './videos/PackageDetailTab';
import { styles } from '../styles';

export function VideosTab({ packages }: { packages: TrainerVideoPackage[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = packages.find(p => p.id === openId);

  if (open) {
    return <PackageDetailTab pkg={open} onBack={() => setOpenId(null)} />;
  }

  if (packages.length === 0) {
    return (
      <ScrollView contentContainerStyle={[styles.scrollContent, { alignItems: 'center', paddingTop: 60 }]}>
        <View style={{ marginBottom: 16 }}>
          <VideoIcon color="#C4C9D2" size={48} />
        </View>
        <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>Noch keine Videos vorhanden.</Text>
        <Text style={[styles.empty, { textAlign: 'center' }]}>Der Admin kann dir Video-Pakete zuweisen.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionTitle}>Meine Pakete ({packages.length})</Text>
      {packages.map(p => (
        <TouchableOpacity
          key={p.id}
          style={styles.videoCard}
          onPress={() => setOpenId(p.id)}
          activeOpacity={0.75}
        >
          <View style={styles.videoCardBody}>
            <Text style={styles.videoTitle}>{p.title}</Text>
            <Text style={styles.videoDesc}>
              {p.videos.length} {p.videos.length === 1 ? 'Video' : 'Videos'} · {fmtDateShort(p.created_at.slice(0, 10))}
            </Text>
          </View>
          <Text style={styles.packageChevron}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
