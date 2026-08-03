import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { Card } from '../../components/Card';
import { MonthCalendar, CalendarSizes } from '../../components/MonthCalendar';
import { germanHolidays, isBlockedByPeriod, BlockedPeriod } from '../../utils/bookingRules';
import { fmtDate } from '../../utils/date';
import { Appointment } from '../../types';
import { FadeUp, BackBtn, SectionTitle } from './ui';

// Maße des Buchen-Kalenders (größere Nav-Buttons, kompaktere Zellen).
const CAL_SIZES: CalendarSizes = {
  navBtn: 44, navBtnRadius: 12, bodyPad: 14, bodyPadBottom: 16,
  weekRowMargin: 6, weekLabelSize: 12, dayHeight: 44, dayRadius: 11, dayTextSize: 15,
};

interface Props {
  programName?: string;
  programDuration?: number;
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  todayStr: string;
  selectedDate: string | null;
  /** UTC-Datumsteil von expires_at — Buchung nur bis zu diesem Tag. */
  tokenMaxStr: string | null;
  blockedPeriods: BlockedPeriod[];
  myAppointments: Appointment[];
  onBack: () => void;
  onSelectDate: (ds: string) => void;
}

// Schritt 3: Datum wählen.
export function DateStep({
  programName, programDuration, year, month, onPrevMonth, onNextMonth,
  todayStr, selectedDate, tokenMaxStr, blockedPeriods, myAppointments,
  onBack, onSelectDate,
}: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);

  // Nicht buchbar: Vergangenheit, Wochenende, Feiertag, Sperrzeitraum, nach Token-Frist.
  const dayDisabled = (ds: string) => {
    const [y, m, d] = ds.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    if (ds < todayStr) return true;
    if (dow === 0 || dow === 6) return true;
    if (germanHolidays(y).has(ds)) return true;
    if (isBlockedByPeriod(ds, blockedPeriods)) return true;
    return tokenMaxStr ? ds > tokenMaxStr : false;
  };

  return (
    <FadeUp>
      <BackBtn onPress={onBack} />
      <SectionTitle t="Datum wählen" sub={`${programName} · ${programDuration} Min.`} />
      <Card>
        <MonthCalendar
          year={year}
          month={month}
          onPrevMonth={onPrevMonth}
          onNextMonth={onNextMonth}
          todayStr={todayStr}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          isDayDisabled={dayDisabled}
          getDayDots={ds =>
            !dayDisabled(ds) && myAppointments.some(a => a.date === ds && a.status === 'confirmed')
              ? [C.accentLight]
              : []
          }
          maxFontSizeMultiplier={1.3}
          sizes={CAL_SIZES}
        />
      </Card>
      {tokenMaxStr && (
        <View style={styles.tokenDeadlineHint}>
          <Text style={styles.tokenDeadlineText}>
            ⏳ Nachholtermin muss bis {fmtDate(tokenMaxStr)} gebucht werden
          </Text>
        </View>
      )}
    </FadeUp>
  );
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    tokenDeadlineHint: {
      marginTop: 10, paddingHorizontal: 14, paddingVertical: 10,
      backgroundColor: C.accentBg, borderRadius: 10,
      borderWidth: 1, borderColor: C.cardBorder,
    },
    tokenDeadlineText: { fontSize: 13, color: C.textMid, fontWeight: '600', textAlign: 'center' },
  });
}
