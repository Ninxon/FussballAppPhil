import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { GlassCard } from '../components/GlassCard';
import { supabase } from '../lib/supabase';
import { AppNotification } from '../types';
import { Profile } from '../hooks/useProfile';

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface Props {
  profile: Profile | null;
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    header: {
      paddingHorizontal: 24,
      paddingBottom: 28,
    },
    headerSub: {
      fontSize: 13,
      fontWeight: '600',
      color: C.textFaint,
      letterSpacing: 0.15,
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    headerTitle: {
      fontSize: 32,
      fontWeight: '800',
      color: C.text,
      lineHeight: 38,
      letterSpacing: -0.5,
    },
    content: { paddingHorizontal: 20 },
    emptyCard: {
      padding: 28,
      alignItems: 'center',
    },
    emptyIcon: { alignItems: 'center', marginBottom: 16 },
    emptyIconBar: { width: 28, height: 3, borderRadius: 2, backgroundColor: C.accent, opacity: 0.4 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 6, textAlign: 'center' },
    emptySub: { fontSize: 14, color: C.textFaint, textAlign: 'center', lineHeight: 20 },
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

export function InfosScreen({ profile }: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setNotifications((data ?? []) as AppNotification[]);
        setLoading(false);
      });
  }, []);

  const visibleNotifications = notifications.filter(n =>
    !n.location || n.location === profile?.location
  );

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: 'transparent' }]}
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + 28 }]}>
        <Text style={styles.headerSub}>PK Fussballschule</Text>
        <Text style={styles.headerTitle}>Infos &{'\n'}Neuigkeiten</Text>
      </View>

      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={C.accentLight} style={{ marginTop: 40 }} />
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
                <Text style={styles.cardDate}>{fmtDate(n.created_at)}</Text>
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
