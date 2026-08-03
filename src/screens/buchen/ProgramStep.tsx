import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { PROGRAMS, ProgramId } from '../../constants/programs';
import { PROGRAM_IMAGES } from '../../constants/programImages';
import { FadeUp, BackBtn, SectionTitle } from './ui';

type Program = typeof PROGRAMS[number];

interface Props {
  /** Initial-Load läuft noch — Spinner statt „Kein Nachholtermin verfügbar". */
  loading: boolean;
  hasTokens: boolean;
  hasBothCategories: boolean;
  visiblePrograms: Program[];
  onBack: () => void;
  onSelectProgram: (id: ProgramId) => void;
}

// Schritt 2: Trainingseinheit wählen (oder Leerzustände ohne Token/Berechtigung).
export function ProgramStep({ loading, hasTokens, hasBothCategories, visiblePrograms, onBack, onSelectProgram }: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);

  if (!hasTokens && loading) {
    return (
      <FadeUp>
        <SectionTitle t="Nachholtermin buchen" />
        <ActivityIndicator color={C.accent} style={{ marginTop: 32 }} />
      </FadeUp>
    );
  }

  if (!hasTokens) {
    return (
      <FadeUp>
        <SectionTitle t="Nachholtermin buchen" />
        <View style={styles.noPrograms}>
          <View style={styles.noProgramsIconWrap}>
            <View style={styles.noProgramsBar} />
            <View style={[styles.noProgramsBar, { width: 24, marginTop: 6 }]} />
            <View style={[styles.noProgramsBar, { width: 16, marginTop: 6 }]} />
          </View>
          <Text style={styles.noProgramsTitle}>Kein Nachholtermin verfügbar</Text>
          <Text style={styles.noProgramsText}>
            Nachholtermine entstehen automatisch, wenn du einen bestehenden Termin stornierst. Du hast aktuell keinen offenen Nachholtermin.
          </Text>
        </View>
      </FadeUp>
    );
  }

  return (
    <FadeUp>
      {hasBothCategories && <BackBtn onPress={onBack} />}
      <SectionTitle t="Nachholtermin buchen" sub="Wähle deine Trainingseinheit" />

      {visiblePrograms.length === 0 ? (
        <View style={styles.noPrograms}>
          <View style={styles.noProgramsIconWrap}>
            <View style={styles.noProgramsCircle} />
          </View>
          <Text style={styles.noProgramsTitle}>Keine Trainingseinheiten verfügbar</Text>
          <Text style={styles.noProgramsText}>Wende dich an deinen Trainer, um Buchungsberechtigungen zu erhalten.</Text>
        </View>
      ) : (
        visiblePrograms.map(p => (
          <TouchableOpacity
            key={p.id}
            onPress={() => onSelectProgram(p.id)}
            activeOpacity={0.8}
            style={styles.programCard}
          >
            <View style={styles.programImageWrap}>
              <Image source={PROGRAM_IMAGES[p.id]} style={styles.programImage} resizeMode="cover" />
              <LinearGradient
                colors={['transparent', 'rgba(10,20,38,0.75)']}
                style={styles.programImageGradient}
              />
              <View style={styles.programImageOverlay}>
                <Text style={styles.programNameOverlay}>{p.name}</Text>
                <Text style={styles.programDurationOverlay}>{p.duration} Min. · {p.capacity === 1 ? '1 Spieler' : `max. ${p.capacity} Spieler`}</Text>
              </View>
            </View>
            <View style={styles.programBody}>
              <Text style={styles.programDesc}>{p.description}</Text>
              <View style={styles.programCta}>
                <Text style={styles.programCtaText}>Auswählen</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </FadeUp>
  );
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    noPrograms: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 },
    noProgramsIconWrap: {
      width: 72, height: 72, borderRadius: 20,
      backgroundColor: C.accentBg,
      alignItems: 'center', justifyContent: 'center', marginBottom: 16,
      borderWidth: 1, borderColor: C.cardBorder,
    },
    noProgramsBar: { width: 32, height: 3, borderRadius: 2, backgroundColor: C.accent, opacity: 0.5 },
    noProgramsCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: C.accent, opacity: 0.5 },
    noProgramsTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 10, textAlign: 'center' },
    noProgramsText: { fontSize: 14, color: C.textFaint, textAlign: 'center', lineHeight: 21 },
    programCard: {
      backgroundColor: C.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.cardBorder,
      marginBottom: 14,
      overflow: 'hidden',
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.07,
      shadowRadius: 10,
      elevation: 3,
    },
    programImageWrap: { width: '100%', height: 155, overflow: 'hidden' },
    programImage: { width: '100%', height: '100%' },
    programImageGradient: {
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 110,
    },
    programImageOverlay: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: 16, paddingBottom: 14,
    },
    programNameOverlay: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
    programDurationOverlay: { fontSize: 12, color: 'rgba(255,255,255,0.80)', marginTop: 3 },
    programBody: { padding: 16, paddingBottom: 0 },
    programDesc: { fontSize: 13, color: C.textMid, lineHeight: 19, marginBottom: 14 },
    programCta: {
      backgroundColor: C.accent,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      marginBottom: 16,
    },
    programCtaText: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  });
}
