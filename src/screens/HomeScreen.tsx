import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { GlassCard } from '../components/GlassCard';
import { Btn } from '../components/Btn';
import { FadeIn } from '../components/FadeIn';
import { ScreenHeader } from '../components/ScreenHeader';
import { Appointment, Tab, CancellationToken, Player } from '../types';
import { todayStr, fmtDate } from '../utils/date';
import { PROGRAMS, PROGRAM_COLORS } from '../constants/programs';

interface Props {
  appointments: Appointment[];
  player: Player | null;
  activeTokens: CancellationToken[];
  setTab: (t: Tab) => void;
  header?: React.ReactNode;
}

function daysUntil(isoDate: string): number {
  // Auf Kalendertag-Basis rechnen, passend zum angezeigten „Gültig bis"-Datum.
  // expires_at ist Berlin-Mitternacht, in UTC gespeichert (z. B. 22:00Z) — der
  // Roh-Zeitstempel + Math.ceil würde die Tageszahl sonst um eins verfälschen.
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    section: {
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    nachholCard: {
      overflow: 'hidden',
      borderLeftWidth: 4,
      borderRadius: 18,
    },
    nachholInner: {
      padding: 18,
    },
    nachholHeader: {
      fontSize: 11,
      fontWeight: '700',
      color: C.textFaint,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 10,
    },
    nachholRow: {
      marginBottom: 8,
    },
    deadlineBadge: {
      alignSelf: 'flex-start',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    nachholDays: {
      fontSize: 15,
      fontWeight: '800',
    },
    nachholSub: {
      fontSize: 13,
      color: C.textMid,
      marginBottom: 4,
    },
    nachholHint: {
      fontSize: 12,
      color: C.textFaint,
      fontStyle: 'italic',
      marginTop: 2,
    },
    nextCard: {
      overflow: 'hidden',
      flexDirection: 'row',
      borderRadius: 20,
    },
    nextColorBar: {
      width: 5,
      borderRadius: 0,
    },
    nextContent: {
      flex: 1,
      padding: 20,
    },
    nextLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: C.textFaint,
      textTransform: 'uppercase',
      letterSpacing: 0.14,
      marginBottom: 8,
    },
    nextTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: C.text,
      marginBottom: 4,
      letterSpacing: -0.3,
    },
    nextDate: {
      fontSize: 15,
      color: C.textMid,
      marginBottom: 14,
      fontWeight: '500',
    },
    nextMeta: {
      flexDirection: 'row',
      gap: 8,
    },
    metaChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    metaChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: C.textMid,
    },
    emptyCard: {
      padding: 32,
      alignItems: 'center',
      borderRadius: 20,
    },
    emptyIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 14,
      backgroundColor: C.accentBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    emptyIconInner: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: C.accent },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 4, textAlign: 'center' },
    emptySub: { fontSize: 14, color: C.textFaint, textAlign: 'center', lineHeight: 20 },
    btns: { paddingHorizontal: 20 },
    noQuotaHint: {
      fontSize: 12,
      color: C.textFaint,
      textAlign: 'center',
      marginTop: 8,
    },
  });
}

export function HomeScreen({ appointments, player, activeTokens, setTab, header }: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const firstName = player?.name?.split(' ')[0] ?? '';

  const ts = todayStr();
  const next = [...appointments]
    .filter(a => a.date >= ts && a.status === 'confirmed')
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];

  const hasTokens = activeTokens.length > 0;
  const buchenActive = hasTokens;

  const earliestToken = activeTokens
    .slice()
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at))[0];
  const tokenDaysLeft = earliestToken ? daysUntil(earliestToken.expires_at) : null;

  const deadlineColor =
    tokenDaysLeft !== null
      ? tokenDaysLeft <= 7 ? '#DC2626'
      : tokenDaysLeft <= 14 ? '#D97706'
      : C.accentLight
      : C.accentLight;

  const programColor = next ? (PROGRAM_COLORS[next.program] ?? C.accentLight) : C.accentLight;

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: 'transparent' }]}
      contentContainerStyle={{ paddingBottom: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <FadeIn>

        {/* Header */}
        <ScreenHeader>Guten Tag,{'\n'}{firstName}!</ScreenHeader>

        {header && <View style={{ paddingHorizontal: 20 }}>{header}</View>}

        {/* Nachholtermin-Frist */}
        {earliestToken && tokenDaysLeft !== null && (
          <View style={styles.section}>
            <GlassCard style={[styles.nachholCard, { borderLeftColor: deadlineColor, borderLeftWidth: 4 }]}>
              <View style={styles.nachholInner}>
                <Text style={styles.nachholHeader}>Nachholtermin verfügbar</Text>
                <View style={styles.nachholRow}>
                  <View style={[styles.deadlineBadge, { backgroundColor: deadlineColor + '18' }]}>
                    <Text style={[styles.nachholDays, { color: deadlineColor }]}>
                      Noch {tokenDaysLeft} {tokenDaysLeft === 1 ? 'Tag' : 'Tage'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.nachholSub}>
                  Gültig bis {fmtDate(earliestToken.expires_at.slice(0, 10))}
                  {activeTokens.length > 1 ? ` · ${activeTokens.length} Termine offen` : ''}
                </Text>
                <Text style={styles.nachholHint}>
                  Verfällt 1 Monat nach dem stornierten Termin — jetzt buchen!
                </Text>
              </View>
            </GlassCard>
          </View>
        )}

        {/* Nächster Termin */}
        <View style={styles.section}>
          {next ? (
            <GlassCard style={styles.nextCard}>
              <View style={[styles.nextColorBar, { backgroundColor: programColor }]} />
              <View style={styles.nextContent}>
                <Text style={styles.nextLabel}>Nächster Termin</Text>
                <Text style={styles.nextTitle}>{PROGRAMS.find(p => p.id === next.program)?.name ?? 'Training'}</Text>
                <Text style={styles.nextDate}>{fmtDate(next.date)}</Text>
                <View style={styles.nextMeta}>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>{next.time} Uhr</Text>
                  </View>
                  <View style={[styles.metaChip, { backgroundColor: programColor + '18', borderColor: programColor + '40' }]}>
                    <Text style={[styles.metaChipText, { color: programColor }]}>
                      {PROGRAMS.find(p => p.id === next.program)?.duration ?? 55} Min.
                    </Text>
                  </View>
                </View>
              </View>
            </GlassCard>
          ) : (
            <GlassCard style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <View style={styles.emptyIconInner} />
              </View>
              <Text style={styles.emptyTitle}>Kein bevorstehender Termin</Text>
              <Text style={styles.emptySub}>Buche jetzt deinen nächsten Nachholtermin</Text>
            </GlassCard>
          )}
        </View>

        {/* Buttons */}
        <View style={styles.btns}>
          <Btn
            label="Nachholtermin buchen"
            onPress={() => setTab('buchen')}
            variant={buchenActive ? 'primary' : 'ghost'}
            disabled={!buchenActive}
          />
          {!buchenActive && (
            <Text style={styles.noQuotaHint}>Kein Nachholtermin verfügbar</Text>
          )}
          <View style={{ height: 12 }} />
          <Btn label="Meine Termine anzeigen" onPress={() => setTab('termine')} variant="ghost" />
        </View>

      </FadeIn>
    </ScrollView>
  );
}
