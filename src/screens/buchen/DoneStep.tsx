import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { GlassCard } from '../../components/GlassCard';
import { Btn } from '../../components/Btn';
import { Location } from '../../constants/studio';
import { Tab } from '../../types';
import { fmtDate } from '../../utils/date';

interface Props {
  programName?: string;
  selDate: string;
  selTime: string;
  selLocation: Location | null;
  setTab: (t: Tab) => void;
}

// Schritt 6: Bestätigung mit Scale/Fade-Einblendung (läuft beim Mount).
export function DoneStep({ programName, selDate, selTime, selLocation, setTab }: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const scaleAnim = useRef(new Animated.Value(0.93)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.doneWrap, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <View style={styles.checkCircle}>
        <Text style={styles.checkMark}>✓</Text>
      </View>
      <Text style={styles.doneTitle}>Buchung bestätigt!</Text>
      <Text style={styles.doneMeta}>{programName}</Text>
      <Text style={styles.doneMeta}>{fmtDate(selDate)}</Text>
      <Text style={styles.doneMeta}>{selTime} Uhr</Text>
      {selLocation && <Text style={styles.doneMeta}>{selLocation}</Text>}
      <GlassCard style={styles.emailNote}>
        <Text style={styles.emailNoteText}>Bestätigung folgt per E-Mail</Text>
      </GlassCard>
      <Btn label="Zur Startseite" onPress={() => setTab('home')} variant="primary" style={{ marginBottom: 10, width: '100%' }} />
      <Btn label="Meine Termine" onPress={() => setTab('termine')} variant="ghost" style={{ width: '100%' }} />
    </Animated.View>
  );
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    doneWrap: { alignItems: 'center', paddingTop: 30 },
    checkCircle: {
      width: 96, height: 96, borderRadius: 48,
      backgroundColor: C.accent,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 24,
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.30,
      shadowRadius: 20,
      elevation: 10,
    },
    checkMark: { color: '#fff', fontSize: 40, fontWeight: '700' },
    doneTitle: { fontSize: 28, fontWeight: '800', color: C.text, marginBottom: 8, letterSpacing: -0.4 },
    doneMeta: { fontSize: 16, color: C.textMid, marginBottom: 4 },
    emailNote: { paddingHorizontal: 20, paddingVertical: 14, marginVertical: 32, alignSelf: 'stretch' },
    emailNoteText: { fontSize: 15, color: C.text, textAlign: 'center', fontWeight: '500' },
  });
}
