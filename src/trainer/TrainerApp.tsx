import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { todayStr } from '../utils/date';
import { groupSlots } from './types';
import { useTrainerData } from './useTrainerData';
import { CalendarIcon, VideoIcon, PersonIcon, NAV_ACTIVE, NAV_INACTIVE } from './icons';
import { TermineTab } from './screens/TermineTab';
import { VideosTab } from './screens/VideosTab';
import { ProfilTab } from './screens/ProfilTab';
import { styles } from './styles';

type Tab = 'termine' | 'videos' | 'profil';

const NAV_ITEMS: { id: Tab; label: string; Icon: typeof CalendarIcon }[] = [
  { id: 'termine', label: 'Termine', Icon: CalendarIcon },
  { id: 'videos',  label: 'Videos',  Icon: VideoIcon },
  { id: 'profil',  label: 'Profil',  Icon: PersonIcon },
];

interface Props {
  onLogout: () => void;
}

// Shell des Trainer-Bereichs: Kopfzeile, Tab-Auswahl und Bottom-Nav.
// Die Tabs liegen in ./screens/, das Laden in ./useTrainerData.
export function TrainerApp({ onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('termine');
  const { appointments, profile, videos, loading, error, reload } = useTrainerData();

  const ts = todayStr();
  const todaySlots = React.useMemo(() => groupSlots(appointments.filter(a => a.date === ts)), [appointments, ts]);
  const upcomingSlots = React.useMemo(() => groupSlots(appointments.filter(a => a.date > ts)), [appointments, ts]);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>Trainer-Bereich</Text>
          <Text style={styles.headerTitle}>{profile?.full_name ?? 'Trainer'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Abmelden</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#4A7FD4" />
      ) : error && !profile ? (
        <ScrollView contentContainerStyle={[styles.scrollContent, { alignItems: 'center', paddingTop: 60 }]}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.saveBtn} onPress={reload} activeOpacity={0.7}>
            <Text style={styles.saveBtnText}>Erneut versuchen</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <>
          <View style={styles.content}>
            {tab === 'termine' && (
              <TermineTab todaySlots={todaySlots} upcomingSlots={upcomingSlots} />
            )}
            {tab === 'videos' && <VideosTab videos={videos} />}
            {tab === 'profil' && profile && <ProfilTab profile={profile} />}
          </View>

          {/* Bottom Nav */}
          <View style={styles.bottomNav}>
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <TouchableOpacity
                key={id}
                style={styles.navItem}
                onPress={() => setTab(id)}
                activeOpacity={0.7}
              >
                <Icon color={tab === id ? NAV_ACTIVE : NAV_INACTIVE} />
                <Text style={[styles.navLabel, tab === id && styles.navLabelActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
