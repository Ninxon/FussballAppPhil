import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { Card } from '../components/Card';
import { Btn } from '../components/Btn';
import { Appointment, CancellationToken, Tab } from '../types';
import { DE_MONTHS, DE_DAYS_SHORT } from '../constants/i18n';
import { todayStr, fmtDate } from '../utils/date';

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
import { PROGRAMS, PROGRAM_COLORS } from '../constants/programs';
import { exportToCalendar } from '../utils/calendar';
import { isWithinCancellationDeadline } from '../utils/bookingRules';

interface Props {
  appointments: Appointment[];
  cancelAppointment: (id: string, skipToken?: boolean) => Promise<{ error: any }>;
  activeTokens: CancellationToken[];
  setTab: (t: Tab) => void;
  header?: React.ReactNode;
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: { paddingHorizontal: 20 },
    screenTitle: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -0.4, marginBottom: 20 },
    tokenBanner: {
      backgroundColor: C.accentBg,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      gap: 6,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tokenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accentLight, flexShrink: 0 },
    tokenText: { fontSize: 13, fontWeight: '600', color: C.text, flex: 1 },

    calCard: { marginBottom: 12, overflow: 'hidden' },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      paddingHorizontal: 18,
      borderBottomWidth: 1,
      borderBottomColor: C.cardBorder,
    },
    navBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navBtnText: { fontSize: 20, fontWeight: '700', color: C.accent },
    monthLabel: { fontSize: 17, fontWeight: '700', color: C.text },
    calBody: { padding: 12, paddingBottom: 14 },
    weekRow: { flexDirection: 'row', marginBottom: 4 },
    weekCell: { flex: 1, alignItems: 'center' },
    weekLabel: { fontSize: 11, fontWeight: '700', color: C.textMid },
    dayGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: '14.28%', height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    dayCellSelected: { backgroundColor: C.accent },
    dayCellToday: { backgroundColor: C.accentBg },
    dayText: { fontSize: 14, color: C.text, fontWeight: '400' },
    dayTextSelected: { color: '#fff', fontWeight: '700' },
    dayTextToday: { color: C.accent, fontWeight: '700' },
    dotRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
    dot: { width: 5, height: 5, borderRadius: 3 },

    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 9, height: 9, borderRadius: 5 },
    legendText: { fontSize: 12, color: C.textFaint, fontWeight: '500' },

    filterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    filterLabel: { fontSize: 16, fontWeight: '700', color: C.text },
    clearBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    clearBtnText: { fontSize: 12, fontWeight: '600', color: C.textMid },

    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textFaint,
      textTransform: 'uppercase',
      letterSpacing: 0.12,
      marginBottom: 12,
    },
    emptyText: { textAlign: 'center', color: C.textFaint, fontSize: 15, paddingTop: 24 },

    apptCard: { marginBottom: 12 },
    apptMain: { flexDirection: 'row', padding: 18, gap: 12, alignItems: 'flex-start' },
    colorBar: { width: 4, borderRadius: 2, alignSelf: 'stretch', marginTop: 2 },
    apptContent: { flex: 1 },
    apptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    apptTitle: { fontSize: 17, fontWeight: '800', color: C.text },
    cancelBadge: { backgroundColor: C.redBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
    cancelBadgeText: { fontSize: 11, fontWeight: '700', color: C.red },
    programBadge: {
      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3,
      borderWidth: 1,
    },
    programBadgeText: { fontSize: 11, fontWeight: '700' },
    apptMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    apptMetaLabel: { fontSize: 11, fontWeight: '700', color: C.textFaint, textTransform: 'uppercase', letterSpacing: 0.3, minWidth: 56 },
    apptMetaText: { fontSize: 14, color: C.textMid, fontWeight: '500' },
    actionSection: {
      flexDirection: 'row',
      gap: 10,
      padding: 14,
      paddingHorizontal: 20,
      borderTopWidth: 1,
      borderTopColor: C.cardBorder,
    },
    calBtn: {
      flex: 1, height: 44, borderRadius: 12,
      backgroundColor: C.accentBg, borderWidth: 1,
      borderColor: C.cardBorder,
      alignItems: 'center', justifyContent: 'center',
    },
    calBtnLabel: { fontSize: 13, fontWeight: '700', color: C.accent },
    stornBtn: {
      flex: 1, height: 44, borderRadius: 12,
      backgroundColor: C.redBg, borderWidth: 1,
      borderColor: C.red + '33',
      alignItems: 'center', justifyContent: 'center',
    },
    stornBtnLabel: { fontSize: 13, fontWeight: '700', color: C.red },
    makeupLockNote: {
      paddingHorizontal: 20, paddingBottom: 14, paddingTop: 2,
    },
    makeupLockText: { fontSize: 12, color: C.textFaint, lineHeight: 17, fontStyle: 'italic' },
    deadlineErrorBox: {
      margin: 14, marginBottom: 0, padding: 14, borderRadius: 12,
      backgroundColor: C.redBg, borderWidth: 1, borderColor: C.red + '40',
    },
    deadlineErrorTitle: { fontSize: 14, fontWeight: '800', color: C.red, marginBottom: 6 },
    deadlineErrorText: { fontSize: 13, color: C.red, lineHeight: 19, opacity: 0.85 },
    deadlineErrorBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
    deadlineErrorConfirm: {
      flex: 1, minHeight: 44, paddingVertical: 8, borderRadius: 8,
      backgroundColor: C.red, alignItems: 'center', justifyContent: 'center',
    },
    deadlineErrorConfirmText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    deadlineErrorClose: {
      flex: 1, minHeight: 44, paddingVertical: 8, borderRadius: 8,
      backgroundColor: C.accentBg, alignItems: 'center', justifyContent: 'center',
    },
    deadlineErrorCloseText: { fontSize: 12, fontWeight: '700', color: C.red },
    confirmSection: { borderTopWidth: 1, borderTopColor: C.cardBorder, padding: 16, paddingHorizontal: 20 },
    confirmText: { fontSize: 15, color: C.textMid, marginBottom: 14 },
    cancelErrorText: { fontSize: 13, fontWeight: '600', color: C.red, marginBottom: 12, lineHeight: 18 },
    confirmBtns: { flexDirection: 'row', gap: 10 },
    cancelYesBtn: {
      flex: 1, height: 46, borderRadius: 12, backgroundColor: C.red,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: C.red, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.27, shadowRadius: 6, elevation: 3,
    },
    cancelYesLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
    cancelNoBtn: {
      flex: 1, height: 46, borderRadius: 12,
      backgroundColor: C.accentBg, borderWidth: 1, borderColor: C.cardBorder,
      alignItems: 'center', justifyContent: 'center',
    },
    cancelNoLabel: { fontSize: 15, fontWeight: '600', color: C.textMid },
  });
}

function ApptCard({ appt, onCancel }: { appt: Appointment; onCancel: (id: string, skipToken?: boolean) => Promise<{ error: any }> }) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const [expanded, setExpanded] = useState(false);
  const [deadlineError, setDeadlineError] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const doCancel = async (skipToken?: boolean) => {
    setCancelling(true);
    setCancelError(null);
    const { error } = await onCancel(appt.id, skipToken);
    setCancelling(false);
    if (error) {
      setCancelError(error.message ?? 'Stornierung fehlgeschlagen. Bitte versuche es erneut.');
    } else {
      setExpanded(false);
      setDeadlineError(false);
    }
  };
  const ts = todayStr();
  const nowTime = nowTimeStr();
  const isPast = appt.date < ts || (appt.date === ts && appt.time <= nowTime);
  const dimmed = appt.status === 'cancelled' || isPast;
  const upcoming = appt.status === 'confirmed' && !isPast;
  const program = PROGRAMS.find(p => p.id === appt.program);
  const programColor = PROGRAM_COLORS[appt.program] ?? C.accentLight;
  // Ein Nachholtermin darf max. zweimal storniert-und-neu-gebucht werden
  // (makeup_count 0 und 1). Danach nur noch der Trainer/Admin.
  const cancelLocked = !!appt.is_makeup && (appt.makeup_count ?? 0) >= 2;

  const handleStornPress = () => {
    if (isWithinCancellationDeadline(appt.date, appt.time)) {
      setDeadlineError(true);
    } else {
      setDeadlineError(false);
      setExpanded(true);
    }
  };

  return (
    <Card style={[styles.apptCard, dimmed ? { opacity: 0.5 } : undefined]}>
      <View style={styles.apptMain}>
        <View style={[styles.colorBar, { backgroundColor: appt.status === 'cancelled' ? '#CBD5E1' : programColor }]} />
        <View style={styles.apptContent}>
          <View style={styles.apptHeader}>
            <Text style={[styles.apptTitle, { color: appt.status === 'cancelled' ? C.textMid : C.text }]}>
              {program?.name ?? 'Training'}
            </Text>
            {appt.status === 'cancelled' ? (
              <View style={styles.cancelBadge}>
                <Text style={styles.cancelBadgeText}>Storniert</Text>
              </View>
            ) : (
              <View style={[styles.programBadge, { backgroundColor: programColor + '18', borderColor: programColor + '40' }]}>
                <Text style={[styles.programBadgeText, { color: programColor }]}>{program?.duration ?? 55} Min.</Text>
              </View>
            )}
          </View>
          <View style={styles.apptMeta}>
            <Text style={styles.apptMetaLabel}>Datum</Text>
            <Text style={styles.apptMetaText}>{fmtDate(appt.date)}</Text>
          </View>
          <View style={styles.apptMeta}>
            <Text style={styles.apptMetaLabel}>Uhrzeit</Text>
            <Text style={styles.apptMetaText}>{appt.time} Uhr</Text>
          </View>
          {appt.location && (
            <View style={styles.apptMeta}>
              <Text style={styles.apptMetaLabel}>Standort</Text>
              <Text style={styles.apptMetaText}>{appt.location}</Text>
            </View>
          )}
        </View>
      </View>

      {upcoming && (
        cancelLocked ? (
          <View>
            <View style={styles.actionSection}>
              <TouchableOpacity style={styles.calBtn} activeOpacity={0.8} onPress={() => exportToCalendar(appt).catch(console.error)}>
                <Text style={styles.calBtnLabel}>In Kalender</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.makeupLockNote}>
              <Text style={styles.makeupLockText}>
                Nachholtermine kann nur dein Trainer stornieren – bitte melde dich bei uns.
              </Text>
            </View>
          </View>
        ) : expanded ? (
          <View style={styles.confirmSection}>
            <Text style={styles.confirmText}>Termin wirklich stornieren?</Text>
            {cancelError && <Text style={styles.cancelErrorText}>{cancelError}</Text>}
            <View style={styles.confirmBtns}>
              <TouchableOpacity onPress={() => doCancel()} disabled={cancelling} style={[styles.cancelYesBtn, cancelling && { opacity: 0.6 }]} activeOpacity={0.8}>
                <Text style={styles.cancelYesLabel}>{cancelling ? 'Storniere…' : 'Ja, stornieren'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setExpanded(false)} disabled={cancelling} style={styles.cancelNoBtn} activeOpacity={0.8}>
                <Text style={styles.cancelNoLabel}>Abbrechen</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View>
            {deadlineError && (
              <View style={styles.deadlineErrorBox}>
                <Text style={styles.deadlineErrorTitle}>Stornierung innerhalb der 3-Stunden-Frist</Text>
                <Text style={styles.deadlineErrorText}>
                  Du kannst den Termin noch stornieren, erhältst jedoch{' '}
                  <Text style={{ fontWeight: '800' }}>keinen Nachholtermin</Text>, da die 3-Stunden-Frist abgelaufen ist.
                </Text>
                {cancelError && <Text style={[styles.cancelErrorText, { marginTop: 8 }]}>{cancelError}</Text>}
                <View style={styles.deadlineErrorBtns}>
                  <TouchableOpacity
                    onPress={() => doCancel(true)}
                    disabled={cancelling}
                    style={[styles.deadlineErrorConfirm, cancelling && { opacity: 0.6 }]}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.deadlineErrorConfirmText}>{cancelling ? 'Storniere…' : 'Trotzdem stornieren'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDeadlineError(false)} style={styles.deadlineErrorClose} activeOpacity={0.7}>
                    <Text style={styles.deadlineErrorCloseText}>Abbrechen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <View style={styles.actionSection}>
              <TouchableOpacity style={styles.calBtn} activeOpacity={0.8} onPress={() => exportToCalendar(appt).catch(console.error)}>
                <Text style={styles.calBtnLabel}>In Kalender</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleStornPress} style={styles.stornBtn} activeOpacity={0.8}>
                <Text style={styles.stornBtnLabel}>Stornieren</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      )}
    </Card>
  );
}

export function TermineScreen({ appointments, cancelAppointment, activeTokens, setTab, header }: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  const [calM, setCalM] = useState(new Date().getMonth());
  const [calY, setCalY] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);

  const ts = todayStr();

  const prevMonth = () => { const d = new Date(calY, calM - 1); setCalM(d.getMonth()); setCalY(d.getFullYear()); };
  const nextMonth = () => { const d = new Date(calY, calM + 1); setCalM(d.getMonth()); setCalY(d.getFullYear()); };

  const daysInMonth = new Date(calY, calM + 1, 0).getDate();
  const firstDow = (new Date(calY, calM, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const confirmedAppts = appointments.filter(a => a.status === 'confirmed');

  const listAppts = selectedDate
    ? appointments.filter(a => a.date === selectedDate)
    : null;

  const nowTime = nowTimeStr();
  const upcoming = selectedDate ? [] : [...appointments]
    .filter(a => a.status === 'confirmed' && (a.date > ts || (a.date === ts && a.time > nowTime)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const past = selectedDate ? [] : [...appointments]
    .filter(a => a.status === 'cancelled' || a.date < ts || (a.date === ts && a.time <= nowTime))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: 'transparent' }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: 20 }]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        {header}
        <Text style={styles.screenTitle}>Meine Termine</Text>

        {activeTokens.length > 0 && (
          <View style={styles.tokenBanner}>
            {activeTokens.map(token => (
              <View key={token.id} style={styles.tokenRow}>
                <View style={styles.tokenDot} />
                <Text style={styles.tokenText}>
                  Nachholtermin verfügbar bis {fmtDate(token.expires_at.slice(0, 10))}
                  {' · '}{token.category === 'individual' ? 'Individualtraining' : 'Gruppentraining'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Kalender */}
        <Card style={styles.calCard}>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.8}>
              <Text style={styles.navBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{DE_MONTHS[calM]} {calY}</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.8}>
              <Text style={styles.navBtnText}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.calBody}>
            <View style={styles.weekRow}>
              {DE_DAYS_SHORT.map(d => (
                <View key={d} style={styles.weekCell}>
                  <Text style={styles.weekLabel}>{d}</Text>
                </View>
              ))}
            </View>

            <View style={styles.dayGrid}>
              {cells.map((d, i) => {
                if (!d) return <View key={`e-${i}`} style={styles.dayCell} />;
                const ds = `${calY}-${String(calM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayAppts = confirmedAppts.filter(a => a.date === ds);
                const isSel = selectedDate === ds;
                const isToday = ds === ts;

                return (
                  <TouchableOpacity
                    key={`d-${i}`}
                    onPress={() => setSelectedDate(isSel ? null : ds)}
                    activeOpacity={0.75}
                    style={[
                      styles.dayCell,
                      isSel && styles.dayCellSelected,
                      isToday && !isSel && styles.dayCellToday,
                    ]}
                  >
                    <Text style={[
                      styles.dayText,
                      isSel && styles.dayTextSelected,
                      isToday && !isSel && styles.dayTextToday,
                    ]}>
                      {d}
                    </Text>
                    {dayAppts.length > 0 && (
                      <View style={styles.dotRow}>
                        {dayAppts.slice(0, 3).map((a, idx) => (
                          <View
                            key={idx}
                            style={[styles.dot, { backgroundColor: isSel ? 'rgba(255,255,255,0.9)' : (PROGRAM_COLORS[a.program] ?? C.accentLight) }]}
                          />
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Card>

        {/* Legende */}
        <View style={styles.legend}>
          {PROGRAMS.map(p => (
            <View key={p.id} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: PROGRAM_COLORS[p.id] }]} />
              <Text style={styles.legendText}>{p.name}</Text>
            </View>
          ))}
        </View>

        {/* Termine Liste */}
        {selectedDate ? (
          <>
            <View style={styles.filterHeader}>
              <Text style={styles.filterLabel}>{fmtDate(selectedDate)}</Text>
              <TouchableOpacity onPress={() => setSelectedDate(null)} style={styles.clearBtn} activeOpacity={0.7}>
                <Text style={styles.clearBtnText}>✕ Alle anzeigen</Text>
              </TouchableOpacity>
            </View>
            {listAppts!.length === 0 ? (
              <Text style={styles.emptyText}>Keine Termine an diesem Tag.</Text>
            ) : (
              listAppts!.map(a => <ApptCard key={a.id} appt={a} onCancel={cancelAppointment} />)
            )}
          </>
        ) : (
          <>
            {upcoming.length === 0 && past.length === 0 && (
              <Text style={styles.emptyText}>Noch keine Termine vorhanden.</Text>
            )}
            {upcoming.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Bevorstehend</Text>
                {upcoming.map(a => <ApptCard key={a.id} appt={a} onCancel={cancelAppointment} />)}
              </>
            )}
            {past.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Vergangene Termine</Text>
                {past.map(a => <ApptCard key={a.id} appt={a} onCancel={cancelAppointment} />)}
              </>
            )}
          </>
        )}
      </Animated.View>
    </ScrollView>
  );
}
