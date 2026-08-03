import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { DE_MONTHS, DE_DAYS_SHORT } from '../constants/i18n';
import { monthCells } from '../utils/date';

// Gemeinsames Monatsraster für TermineScreen und BuchenScreen.
// Die (leicht unterschiedlichen) Maße beider Screens kommen als `sizes`-Props,
// damit die Umstellung optisch identisch bleibt.

export type CalendarSizes = {
  navBtn: number;
  navBtnRadius: number;
  bodyPad: number;
  bodyPadBottom: number;
  weekRowMargin: number;
  weekLabelSize: number;
  dayHeight: number;
  dayRadius: number;
  dayTextSize: number;
};

interface Props {
  year: number;
  month: number; // 0-basiert
  onPrevMonth: () => void;
  onNextMonth: () => void;
  todayStr: string;
  selectedDate?: string | null;
  onSelectDate: (ds: string) => void;
  /** Tag nicht wählbar (ausgegraut); default: alle wählbar. */
  isDayDisabled?: (ds: string) => boolean;
  /** Punkt-Farben unter dem Tag (z. B. Programme, Buchungs-Marker). */
  getDayDots?: (ds: string, isSelected: boolean) => string[];
  maxFontSizeMultiplier?: number;
  sizes: CalendarSizes;
}

export function MonthCalendar({
  year, month, onPrevMonth, onNextMonth, todayStr, selectedDate,
  onSelectDate, isDayDisabled, getDayDots, maxFontSizeMultiplier, sizes,
}: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C, sizes), [C, sizes]);
  const cells = monthCells(year, month);

  return (
    <>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={onPrevMonth} style={styles.navBtn} activeOpacity={0.8}>
          <Text style={styles.navBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{DE_MONTHS[month]} {year}</Text>
        <TouchableOpacity onPress={onNextMonth} style={styles.navBtn} activeOpacity={0.8}>
          <Text style={styles.navBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.calBody}>
        <View style={styles.weekRow}>
          {DE_DAYS_SHORT.map(d => (
            <View key={d} style={styles.weekCell}>
              <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.weekLabel}>{d}</Text>
            </View>
          ))}
        </View>

        <View style={styles.dayGrid}>
          {cells.map((d, i) => {
            if (!d) return <View key={`empty-${i}`} style={styles.dayCell} />;
            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const disabled = isDayDisabled ? isDayDisabled(ds) : false;
            const isSel = selectedDate === ds;
            const isToday = ds === todayStr;
            const dots = getDayDots ? getDayDots(ds, isSel) : [];

            return (
              <TouchableOpacity
                key={`day-${i}`}
                disabled={disabled}
                onPress={() => onSelectDate(ds)}
                activeOpacity={0.75}
                style={[styles.dayCell, isSel && styles.dayCellSelected, isToday && !isSel && styles.dayCellToday]}
              >
                <Text
                  maxFontSizeMultiplier={maxFontSizeMultiplier}
                  style={[
                    styles.dayText,
                    disabled && styles.dayTextDisabled,
                    isSel && styles.dayTextSelected,
                    isToday && !isSel && styles.dayTextToday,
                  ]}
                >
                  {d}
                </Text>
                {dots.length > 0 && (
                  <View style={styles.dotRow}>
                    {dots.slice(0, 3).map((color, idx) => (
                      <View key={idx} style={[styles.dot, { backgroundColor: color }]} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </>
  );
}

function getStyles(C: Colors, s: CalendarSizes) {
  return StyleSheet.create({
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
      width: s.navBtn,
      height: s.navBtn,
      borderRadius: s.navBtnRadius,
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navBtnText: { fontSize: 20, fontWeight: '700', color: C.accent },
    monthLabel: { fontSize: 17, fontWeight: '700', color: C.text },
    calBody: { padding: s.bodyPad, paddingBottom: s.bodyPadBottom },
    weekRow: { flexDirection: 'row', marginBottom: s.weekRowMargin },
    weekCell: { flex: 1, alignItems: 'center' },
    weekLabel: { fontSize: s.weekLabelSize, fontWeight: '700', color: C.textMid },
    dayGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: '14.28%', height: s.dayHeight, alignItems: 'center', justifyContent: 'center', borderRadius: s.dayRadius },
    dayCellSelected: { backgroundColor: C.accent },
    dayCellToday: { backgroundColor: C.accentBg },
    dayText: { fontSize: s.dayTextSize, color: C.text, fontWeight: '400' },
    dayTextDisabled: { color: C.textFaint },
    dayTextSelected: { color: '#fff', fontWeight: '700' },
    dayTextToday: { color: C.accent, fontWeight: '700' },
    dotRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
    dot: { width: 5, height: 5, borderRadius: 3 },
  });
}
