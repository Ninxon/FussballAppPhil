import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { Card } from '../../components/Card';
import { Btn } from '../../components/Btn';
import { Location } from '../../constants/studio';
import { fmtDate } from '../../utils/date';
import { FadeUp, BackBtn, SectionTitle } from './ui';

interface Props {
  programName?: string;
  programDuration?: number;
  selDate: string;
  selTime: string;
  selLocation: Location | null;
  availLabel: string;
  bookingError: string | null;
  onBook: () => void;
  onBack: () => void;
  onCancel: () => void;
}

// Schritt 5: Zusammenfassung + Buchung auslösen.
export function ConfirmStep({
  programName, programDuration, selDate, selTime, selLocation,
  availLabel, bookingError, onBook, onBack, onCancel,
}: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);

  const rows: [string, string][] = [
    ['Programm', programName ?? ''],
    ['Datum', fmtDate(selDate)],
    ['Uhrzeit', `${selTime} Uhr`],
    ...(selLocation ? [['Standort', selLocation] as [string, string]] : []),
    ['Dauer', `${programDuration ?? 60} Minuten`],
    ['Verfügbar', availLabel],
  ];

  return (
    <FadeUp>
      <BackBtn onPress={onBack} />
      <SectionTitle t="Buchung bestätigen" />
      <Card style={{ marginBottom: 20 }}>
        {rows.map(([k, v], i) => (
          <View key={k} style={[styles.summaryRow, i < rows.length - 1 && styles.summaryRowBorder]}>
            <Text style={styles.summaryKey}>{k}</Text>
            <Text style={styles.summaryVal}>{v}</Text>
          </View>
        ))}
      </Card>
      {bookingError && (
        <Text style={styles.errorText}>{bookingError}</Text>
      )}
      <Btn label="Jetzt buchen" onPress={onBook} variant="primary" style={{ marginBottom: 10 }} />
      <Btn label="Abbrechen" onPress={onCancel} variant="ghost" />
    </FadeUp>
  );
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
    summaryRowBorder: { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
    summaryKey: { fontSize: 15, color: C.textMid },
    summaryVal: { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'right', maxWidth: '55%' },
    errorText: { fontSize: 14, color: C.red, textAlign: 'center', marginBottom: 12, fontWeight: '600' },
  });
}
