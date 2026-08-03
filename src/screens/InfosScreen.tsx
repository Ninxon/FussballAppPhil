import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { GlassCard } from '../components/GlassCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { supabase } from '../lib/supabase';
import { AppNotification, Player } from '../types';
import { fmtTimestampShort } from '../utils/date';

interface Props {
  player: Player | null;
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: { paddingHorizontal: 20 },
    emptyCard: {
      padding: 28,
      alignItems: 'center',
    },
    emptyIcon: { alignItems: 'center', marginBottom: 16 },
    emptyIconBar: { width: 28, height: 3, borderRadius: 2, backgroundColor: C.accent, opacity: 0.4 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 6, textAlign: 'center' },
    emptySub: { fontSize: 14, color: C.textFaint, textAlign: 'center', lineHeight: 20 },
    retryLink: { fontSize: 14, fontWeight: '700', color: C.accent, marginTop: 14, textAlign: 'center' },
    card: {
      padding: 20,
      marginBottom: 14,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    cardDate: { fontSize: 12, fontWeight: '600', color: C.textFaint },
    locationBadge: {
      backgroundColor: C.accentBg,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    locationText: { fontSize: 11, fontWeight: '700', color: C.textMid, textTransform: 'uppercase', letterSpacing: 0.3 },
    cardTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 8 },
    cardBody: { fontSize: 14, color: C.textMid, lineHeight: 21 },
  });
}

export function InfosScreen({ player }: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = React.useCallback(async () => {
    setLoadError(false);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(true);
    } else {
      setNotifications((data ?? []) as AppNotification[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const doRefresh = async () => {
    setRefreshing(true);
    try { await loadNotifications(); } finally { setRefreshing(false); }
  };

  const visibleNotifications = notifications.filter(n =>
    !n.location || n.location === player?.location
  );

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: 'transparent' }]}
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={C.accentLight} colors={[C.accentLight]} />
      }
    >
      <ScreenHeader>Infos &{'\n'}Neuigkeiten</ScreenHeader>

      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={C.accentLight} style={{ marginTop: 40 }} />
        ) : loadError ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Infos konnten nicht geladen werden</Text>
            <Text style={styles.emptySub}>Bitte überprüfe deine Internetverbindung.</Text>
            <Text style={styles.retryLink} onPress={() => { setLoading(true); loadNotifications(); }}>Erneut versuchen</Text>
          </GlassCard>
        ) : visibleNotifications.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <View style={styles.emptyIconBar} />
              <View style={[styles.emptyIconBar, { width: 20, marginTop: 5 }]} />
            </View>
            <Text style={styles.emptyTitle}>Keine Infos vorhanden</Text>
            <Text style={styles.emptySub}>Hier erscheinen Neuigkeiten und Infos zu deinem Standort.</Text>
          </GlassCard>
        ) : (
          visibleNotifications.map(n => (
            <GlassCard key={n.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardDate}>{fmtTimestampShort(n.created_at)}</Text>
                {n.location && (
                  <View style={styles.locationBadge}>
                    <Text style={styles.locationText}>📍 {n.location}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardTitle}>{n.title}</Text>
              <Text style={styles.cardBody}>{n.body}</Text>
            </GlassCard>
          ))
        )}
      </View>
    </ScrollView>
  );
}
