import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { Btn } from '../../components/Btn';
import { Appointment } from '../../types';
import { LOC_COLOR, Location } from '../../constants/studio';
import { fmtShort } from '../../utils/date';
import { FadeUp, BackBtn, SectionTitle, FilterChip } from './ui';

export type SlotEntry = { time: string; location: Location | null; capacity: number };
export type SlotAvailability = {
  totalCapacity: number; booked: number; isGroup: boolean;
  freeInGroup: number; groupUnavailable: boolean;
};

interface Props {
  selDate: string | null;
  todayStr: string;
  isGroup: boolean;
  playerBirthYear: number | null;
  playerLevel: string | null;
  slotEntries: SlotEntry[];
  availableLocations: Location[];
  slotAvailability: (time: string, location: Location | null) => SlotAvailability;
  myAppointments: Appointment[];
  locFilter: 'alle' | Location;
  onLocFilter: (f: 'alle' | Location) => void;
  selTime: string | null;
  selLocation: Location | null;
  onSelectSlot: (time: string, location: Location | null) => void;
  onNext: () => void;
  onBack: () => void;
}

// Schritt 4: Uhrzeit (+ Standort) wählen.
export function TimeStep({
  selDate, todayStr, isGroup, playerBirthYear, playerLevel,
  slotEntries, availableLocations, slotAvailability, myAppointments,
  locFilter, onLocFilter, selTime, selLocation, onSelectSlot, onNext, onBack,
}: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);

  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const isToday = selDate === todayStr;

  const visibleEntries = slotEntries.filter(e => locFilter === 'alle' || e.location === locFilter);

  // Nicht buchbare Slots vorab herausfiltern, damit auch die „keine Zeiten"-
  // Meldung greift. Gruppe: inkompatible Gruppen verstecken (wie bisher).
  // Individual (1:1): nur verfügbare zeigen — volle/vergangene/eigene ausblenden,
  // sonst verwirrt eine Anzeige wie „2 von 2 frei" bei einem Einzeltraining.
  const renderableEntries = visibleEntries.filter(entry => {
    const { totalCapacity, booked, groupUnavailable } = slotAvailability(entry.time, entry.location);
    const userBooked = myAppointments.some(a => a.date === selDate && a.time === entry.time && a.status === 'confirmed');
    const isPast = isToday && entry.time <= nowStr;
    if (isGroup) {
      if (groupUnavailable && !isPast && !userBooked && playerBirthYear && playerLevel) return false;
      return true;
    }
    return booked < totalCapacity && !userBooked && !isPast;
  });

  return (
    <FadeUp>
      <BackBtn onPress={onBack} />
      <SectionTitle t="Uhrzeit wählen" sub={selDate ? fmtShort(selDate) : ''} />

      {availableLocations.length > 0 && (
        <View style={styles.filterRow}>
          <FilterChip label="Alle Standorte" active={locFilter === 'alle'}
            onPress={() => onLocFilter('alle')} />
          {availableLocations.map(loc => (
            <FilterChip key={loc} label={loc} color={LOC_COLOR[loc]} active={locFilter === loc}
              onPress={() => onLocFilter(loc)} />
          ))}
        </View>
      )}

      {renderableEntries.length === 0 ? (
        <Text style={{ color: C.textFaint, textAlign: 'center', marginTop: 24, fontSize: 15 }}>
          An diesem Tag sind keine Zeiten verfügbar.
        </Text>
      ) : (
        <View style={[styles.slotGrid, { marginBottom: 20 }]}>
          {renderableEntries.map(entry => {
            const { totalCapacity, booked, freeInGroup } = slotAvailability(entry.time, entry.location);
            const userBooked = myAppointments.some(a => a.date === selDate && a.time === entry.time && a.status === 'confirmed');
            const isPast = isToday && entry.time <= nowStr;

            const full = booked >= totalCapacity || userBooked || isPast;
            const sel = selTime === entry.time && (selLocation ?? null) === (entry.location ?? null);

            const subLabel = (() => {
              if (isPast) return 'Vergangen';
              if (userBooked) return 'Bereits gebucht';
              if (booked >= totalCapacity) return 'Ausgebucht';
              if (isGroup) return freeInGroup === 1 ? '1 Platz frei' : `${freeInGroup} Plätze frei`;
              return 'Verfügbar';
            })();

            return (
              <TouchableOpacity
                key={`${entry.time}|${entry.location ?? ''}`}
                disabled={full}
                onPress={() => onSelectSlot(entry.time, entry.location)}
                activeOpacity={0.8}
                style={[styles.slot, sel && styles.slotSelected, full && styles.slotFull]}
              >
                <Text maxFontSizeMultiplier={1.3} style={[styles.slotTime, full && styles.slotTimeDimmed, sel && styles.slotTimeSelected]}>{entry.time}</Text>
                {entry.location && (
                  <Text maxFontSizeMultiplier={1.3} style={[styles.slotLoc, { color: sel ? 'rgba(255,255,255,0.85)' : LOC_COLOR[entry.location] }]}>
                    {entry.location}
                  </Text>
                )}
                <Text maxFontSizeMultiplier={1.3} style={[styles.slotSub, full && styles.slotSubDimmed,
                  sel && styles.slotSubSelected,
                  !full && isGroup && freeInGroup === 1 && { color: '#D97706' }]}>
                  {subLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {selTime && <Btn label="Weiter" onPress={onNext} variant="primary" />}
    </FadeUp>
  );
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
    slotLoc: { fontSize: 10, fontWeight: '700', marginTop: 2 },
    slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    slot: {
      width: '30.5%', minHeight: 64, paddingVertical: 8, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: C.cardBorder,
      backgroundColor: C.card,
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    slotSelected: { borderColor: C.accent, backgroundColor: C.accent },
    slotFull: { borderColor: C.cardBorder, backgroundColor: C.accentBg },
    slotTime: { fontSize: 16, fontWeight: '700', color: C.text },
    slotTimeSelected: { color: '#fff' },
    slotTimeDimmed: { color: C.textFaint },
    slotSub: { fontSize: 11, fontWeight: '600', color: C.textMid, marginTop: 3 },
    slotSubSelected: { color: 'rgba(255,255,255,0.75)' },
    slotSubDimmed: { color: C.textFaint },
  });
}
