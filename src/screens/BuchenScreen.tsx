import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Animated, Easing, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { Card } from '../components/Card';
import { GlassCard } from '../components/GlassCard';
import { Btn } from '../components/Btn';
import { Appointment, SlotCount, SlotPlayer, CancellationToken, Tab, TrainerSchedule, Player } from '../types';
import { todayStr, fmtDate, fmtShort, DE_MONTHS, DE_DAYS_SHORT } from '../constants/i18n';
import { PROGRAMS, PROGRAM_CATEGORY, CATEGORY_COLORS, ProgramId } from '../constants/programs';
import { PROGRAM_IMAGES } from '../constants/programImages';
import { germanHolidays, canJoinGroupSlot, reconstructGroups } from '../utils/bookingRules';
import { LOCATIONS, Location } from '../constants/studio';

const LOC_COLOR: Record<Location, string> = { 'Rüsselsheim': '#4A8FE8', 'Kelsterbach': '#5A8C6A' };

interface Props {
  slotCounts: SlotCount[];
  slotPlayers: SlotPlayer[];
  myAppointments: Appointment[];
  player: Player | null;
  activeTokens: CancellationToken[];
  addAppointment: (date: string, time: string, program: string, location?: Location | null) => Promise<{ error: any }>;
  setTab: (t: Tab) => void;
  trainerSchedules?: TrainerSchedule[];
  trainers?: Array<{ id: string; trainer_specialty?: string | null }>;
  refreshSlotData?: () => Promise<void>;
  header?: React.ReactNode;
}

type Step = 'category' | 'program' | 'date' | 'time' | 'confirm' | 'done';

function FadeUp({ children }: { children: React.ReactNode }) {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    fade.setValue(0); slide.setValue(16);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 320, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>{children}</Animated.View>;
}

function BackBtn({ onPress }: { onPress: () => void }) {
  const { C } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20, alignSelf: 'flex-start' }}
      activeOpacity={0.7}
    >
      <Text style={{ fontSize: 20, color: C.accent, fontWeight: '600' }}>‹</Text>
      <Text style={{ fontSize: 15, fontWeight: '600', color: C.accent }}>Zurück</Text>
    </TouchableOpacity>
  );
}

function SectionTitle({ t, sub }: { t: string; sub?: string }) {
  const { C } = useTheme();
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.3 }}>{t}</Text>
      {sub && <Text style={{ fontSize: 15, color: C.textFaint, marginTop: 4 }}>{sub}</Text>}
    </View>
  );
}

function FilterChip({ label, active, color, onPress }: { label: string; active: boolean; color?: string; onPress: () => void }) {
  const { C } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1.5,
        borderColor: active ? (color ?? C.accent) : C.cardBorder,
        backgroundColor: active ? (color ?? C.accent) : C.card,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : C.textMid }}>{label}</Text>
    </TouchableOpacity>
  );
}

const TORWART_PROGRAMS = new Set(['torhueter_individual', 'torhueter_gruppe']);
const FELD_PROGRAMS = new Set(['individual', 'gruppe', 'athletik']);

function isProgramAllowed(player: Player, programId: string): boolean {
  const map: Record<string, keyof Player> = {
    individual: 'can_book_individual',
    gruppe: 'can_book_gruppe',
    athletik: 'can_book_athletik',
    torhueter_individual: 'can_book_torhueter_individual',
    torhueter_gruppe: 'can_book_torhueter_gruppe',
  };
  const key = map[programId];
  if (!key || !player[key]) return false;
  if (player.player_type === 'torwart' && !TORWART_PROGRAMS.has(programId)) return false;
  if (player.player_type === 'feldspieler' && !FELD_PROGRAMS.has(programId)) return false;
  return true;
}

export function BuchenScreen({ slotCounts, slotPlayers, myAppointments, player, activeTokens, addAppointment, setTab, trainerSchedules = [], trainers = [], refreshSlotData, header }: Props) {
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const [step, setStep] = useState<Step>('category');
  const [selectedCategory, setSelectedCategory] = useState<'individual' | 'gruppe' | null>(null);
  const [selProgram, setSelProgram] = useState<ProgramId | null>(null);
  const [selDate, setSelDate] = useState<string | null>(null);
  const [selTime, setSelTime] = useState<string | null>(null);
  const [selLocation, setSelLocation] = useState<Location | null>(null);
  const [locFilter, setLocFilter] = useState<'alle' | Location>('alle');
  const [calM, setCalM] = useState(new Date().getMonth());
  const [calY, setCalY] = useState(new Date().getFullYear());
  const [bookingError, setBookingError] = useState<string | null>(null);
  const doneScaleAnim = useRef(new Animated.Value(0.93));
  const doneFadeAnim = useRef(new Animated.Value(0));

  const tokenIndividual = activeTokens.find(t => t.category === 'individual');
  const tokenGruppe = activeTokens.find(t => t.category === 'gruppe');
  const hasBothCategories = !!(tokenIndividual && tokenGruppe);

  const STEPS: Step[] = hasBothCategories
    ? ['category', 'program', 'date', 'time', 'confirm']
    : ['program', 'date', 'time', 'confirm'];

  const effectiveCategory: 'individual' | 'gruppe' | null =
    selectedCategory ??
    (tokenIndividual && !tokenGruppe ? 'individual' :
     tokenGruppe && !tokenIndividual ? 'gruppe' : null);

  React.useEffect(() => {
    if (step === 'category' && !hasBothCategories) {
      setStep('program');
    }
  }, [step, hasBothCategories]);

  React.useEffect(() => {
    if (step !== 'confirm') setBookingError(null);
  }, [step]);

  React.useEffect(() => {
    if (step === 'time' && selDate && refreshSlotData) {
      refreshSlotData();
    }
  }, [step, selDate]);

  React.useEffect(() => {
    if (step === 'done') {
      doneScaleAnim.current.setValue(0.93);
      doneFadeAnim.current.setValue(0);
      Animated.parallel([
        Animated.timing(doneScaleAnim.current, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(doneFadeAnim.current, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    }
  }, [step]);

  const ts = todayStr();
  const stepIdx = STEPS.indexOf(step);
  const currentProgram = PROGRAMS.find(p => p.id === selProgram);

  // Slot availability + capacity derived from the trainer schedules.
  // Memoized so the per-slot filtering runs once per program/date change
  // instead of re-filtering trainerSchedules for every rendered slot.
  const slotInfo = React.useMemo(() => {
    const baseCapacity = currentProgram?.capacity ?? 1;
    const TORWART_IDS = ['torhueter_individual', 'torhueter_gruppe'];
    const neededSpecialty = selProgram && TORWART_IDS.includes(selProgram) ? 'torwart' : 'spieler';
    const jsDay = selDate ? new Date(selDate + 'T12:00:00').getDay() : 0;
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;
    const relevantIds = trainers
      .filter(t => t.trainer_specialty === neededSpecialty)
      .map(t => t.id);

    // Kapazität pro (Uhrzeit, Standort): jede passende Trainer-Zeile zählt
    // +baseCapacity für ihren Standort. location null = noch nicht zugeordnet
    // (Alt-Slot) — erscheint nur unter "Alle Standorte".
    const byKey = new Map<string, { time: string; location: Location | null; capacity: number }>();
    for (const s of trainerSchedules) {
      if (relevantIds.includes(s.trainer_id) && s.day_of_week === dayOfWeek) {
        const loc = (s.location ?? null) as Location | null;
        const key = `${s.time}|${loc ?? ''}`;
        const cur = byKey.get(key);
        if (cur) cur.capacity += baseCapacity;
        else byKey.set(key, { time: s.time, location: loc, capacity: baseCapacity });
      }
    }

    const slotEntries = [...byKey.values()].sort(
      (a, b) => a.time.localeCompare(b.time) || (a.location ?? '').localeCompare(b.location ?? ''),
    );
    const availableLocations = LOCATIONS.filter(l => slotEntries.some(e => e.location === l));
    const getSlotCapacity = (time: string, location: Location | null): number =>
      byKey.get(`${time}|${location ?? ''}`)?.capacity ?? 0;

    return { relevantIds, slotEntries, availableLocations, getSlotCapacity, baseCapacity };
  }, [currentProgram, selProgram, selDate, trainers, trainerSchedules]);

  const GROUP_SIZE = 4;

  // Single source for slot availability so the time step and the confirm step
  // agree. For groups the free count is the free spots in the *group the player
  // would actually join* (via reconstructGroups) — not the raw slot-wide count,
  // which mixes other trainers' parallel groups at the same time.
  const slotAvailability = (time: string, location: Location | null) => {
    const totalCapacity = slotInfo.getSlotCapacity(time, location);
    const booked = slotCounts.find(s =>
      s.date === selDate && s.time === time && s.program === selProgram &&
      (s.location ?? null) === (location ?? null))?.booked ?? 0;
    const isGroup = selProgram ? PROGRAM_CATEGORY[selProgram] === 'gruppe' : false;
    const playerBirthYear = player?.birth_date ? parseInt(player.birth_date.slice(0, 4)) : null;
    const playerLevel = player?.level ?? null;
    const sessionYear = selDate ? parseInt(selDate.slice(0, 4)) : new Date().getFullYear();

    let freeInGroup = GROUP_SIZE;
    let groupUnavailable = false;
    if (isGroup && playerBirthYear && playerLevel) {
      const existingPlayers = slotPlayers
        .filter(p => p.date === selDate && p.time === time && p.program === selProgram &&
          (p.location ?? null) === (location ?? null))
        .filter(p => p.session_birth_year != null && p.session_level)
        .map(p => ({ birthYear: p.session_birth_year!, level: p.session_level as any, created_at: p.created_at }));
      const groups = reconstructGroups(existingPlayers, GROUP_SIZE, sessionYear);
      const trainerCount = Math.max(1, Math.round(totalCapacity / GROUP_SIZE));

      let targetGroupIndex = -1;
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].length < GROUP_SIZE &&
            canJoinGroupSlot({ birthYear: playerBirthYear, level: playerLevel }, groups[i], sessionYear).allowed) {
          targetGroupIndex = i;
          break;
        }
      }
      if (targetGroupIndex === -1) {
        if (groups.length >= trainerCount) groupUnavailable = true;
        else targetGroupIndex = groups.length;
      }
      if (!groupUnavailable) freeInGroup = GROUP_SIZE - (groups[targetGroupIndex]?.length ?? 0);
    } else if (isGroup) {
      const rem = booked % GROUP_SIZE;
      freeInGroup = rem === 0 ? GROUP_SIZE : GROUP_SIZE - rem;
    }

    return { totalCapacity, booked, isGroup, freeInGroup, groupUnavailable };
  };

  const allowedPrograms = player
    ? PROGRAMS.filter(p => isProgramAllowed(player, p.id))
    : [];

  // ── CategoryStep ──────────────────────────────────────────────
  function CategoryStep() {
    return (
      <FadeUp>
        <SectionTitle t="Nachholtermin buchen" sub="Welche Art von Training möchtest du nachholen?" />
        <TouchableOpacity
          onPress={() => { setSelectedCategory('individual'); setStep('program'); }}
          activeOpacity={0.85}
          style={styles.categoryCard}
        >
          <View style={[styles.categoryAccentBar, { backgroundColor: CATEGORY_COLORS.individual }]} />
          <View style={styles.categoryContent}>
            <View style={styles.categoryBody}>
              <Text style={styles.categoryTag}>EINZELTRAINING</Text>
              <Text style={styles.categoryName}>Nachholtermin buchen</Text>
              <Text style={styles.categorySub}>1 Spieler · 55 Min.</Text>
              {tokenIndividual && (
                <Text style={styles.categoryExpiry}>Token gültig bis {fmtDate(tokenIndividual.expires_at.slice(0, 10))}</Text>
              )}
            </View>
            <Text style={styles.categoryArrow}>›</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setSelectedCategory('gruppe'); setStep('program'); }}
          activeOpacity={0.85}
          style={styles.categoryCard}
        >
          <View style={[styles.categoryAccentBar, { backgroundColor: CATEGORY_COLORS.gruppe }]} />
          <View style={styles.categoryContent}>
            <View style={styles.categoryBody}>
              <Text style={styles.categoryTag}>GRUPPENTRAINING</Text>
              <Text style={styles.categoryName}>Nachholtermin buchen</Text>
              <Text style={styles.categorySub}>max. 4 Spieler · 55 Min.</Text>
              {tokenGruppe && (
                <Text style={styles.categoryExpiry}>Token gültig bis {fmtDate(tokenGruppe.expires_at.slice(0, 10))}</Text>
              )}
            </View>
            <Text style={styles.categoryArrow}>›</Text>
          </View>
        </TouchableOpacity>
      </FadeUp>
    );
  }

  // ── ProgramStep ───────────────────────────────────────────────
  function ProgramStep() {
    const visiblePrograms = effectiveCategory
      ? allowedPrograms.filter(p => PROGRAM_CATEGORY[p.id] === effectiveCategory)
      : allowedPrograms;

    if (activeTokens.length === 0) {
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
        {hasBothCategories && <BackBtn onPress={() => setStep('category')} />}
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
              onPress={() => { setSelProgram(p.id); setStep('date'); }}
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

  // ── DateStep ──────────────────────────────────────────────────
  function DateStep() {
    const daysInMonth = new Date(calY, calM + 1, 0).getDate();
    const firstDow = (new Date(calY, calM, 1).getDay() + 6) % 7;
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const prevMonth = () => { const d = new Date(calY, calM - 1); setCalM(d.getMonth()); setCalY(d.getFullYear()); };
    const nextMonth = () => { const d = new Date(calY, calM + 1); setCalM(d.getMonth()); setCalY(d.getFullYear()); };

    const activeToken = effectiveCategory === 'individual' ? tokenIndividual
      : effectiveCategory === 'gruppe' ? tokenGruppe
      : (tokenIndividual ?? tokenGruppe);
    // Fristdatum direkt aus dem UTC-Datumsteil von expires_at (= exakt 1 Monat
    // nach dem stornierten Termin, DST-sicher). NICHT new Date(...).toLocale… /
    // getDate() verwenden — das verschiebt in Berlin (UTC+1/+2) auf den Folgetag.
    const tokenMaxStr = activeToken ? activeToken.expires_at.slice(0, 10) : null;

    return (
      <FadeUp>
        <BackBtn onPress={() => setStep('program')} />
        <SectionTitle t="Datum wählen" sub={`${currentProgram?.name} · ${currentProgram?.duration} Min.`} />
        <Card>
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
                  <Text maxFontSizeMultiplier={1.3} style={styles.weekLabel}>{d}</Text>
                </View>
              ))}
            </View>
            <View style={styles.dayGrid}>
              {cells.map((d, i) => {
                if (!d) return <View key={`empty-${i}`} style={styles.dayCell} />;
                const ds = `${calY}-${String(calM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dow = new Date(calY, calM, d).getDay();
                const isPast = ds < ts;
                const isWeekend = dow === 0 || dow === 6;
                const isHoliday = germanHolidays(calY).has(ds);
                const isAfterDeadline = tokenMaxStr ? ds > tokenMaxStr : false;
                const isUserBooked = myAppointments.some(a => a.date === ds && a.status === 'confirmed');
                const isSel = selDate === ds;
                const isToday = ds === ts;
                const disabled = isPast || isWeekend || isHoliday || isAfterDeadline;
                return (
                  <TouchableOpacity
                    key={`day-${i}`}
                    disabled={disabled}
                    onPress={() => { setSelDate(ds); setStep('time'); }}
                    activeOpacity={0.7}
                    style={[styles.dayCell, isSel && styles.dayCellSelected, isToday && !isSel && styles.dayCellToday]}
                  >
                    <Text maxFontSizeMultiplier={1.3} style={[styles.dayText, disabled && styles.dayTextDisabled, isSel && styles.dayTextSelected, isToday && !isSel && styles.dayTextToday]}>
                      {d}
                    </Text>
                    {isUserBooked && !disabled && <View style={styles.bookedDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
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

  // ── TimeStep ──────────────────────────────────────────────────
  function TimeStep() {
    const now = new Date();
    const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const isToday = selDate === ts;
    const isGroup = selProgram ? PROGRAM_CATEGORY[selProgram] === 'gruppe' : false;
    const playerBirthYear = player?.birth_date ? parseInt(player.birth_date.slice(0, 4)) : null;
    const playerLevel = player?.level ?? null;

    const { slotEntries, availableLocations } = slotInfo;
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
        <BackBtn onPress={() => setStep('date')} />
        <SectionTitle t="Uhrzeit wählen" sub={selDate ? fmtShort(selDate) : ''} />

        {availableLocations.length > 0 && (
          <View style={styles.filterRow}>
            <FilterChip label="Alle Standorte" active={locFilter === 'alle'}
              onPress={() => { setLocFilter('alle'); setSelTime(null); setSelLocation(null); }} />
            {availableLocations.map(loc => (
              <FilterChip key={loc} label={loc} color={LOC_COLOR[loc]} active={locFilter === loc}
                onPress={() => { setLocFilter(loc); setSelTime(null); setSelLocation(null); }} />
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
                  onPress={() => { setSelTime(entry.time); setSelLocation(entry.location); }}
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
        {selTime && <Btn label="Weiter" onPress={() => setStep('confirm')} variant="primary" />}
      </FadeUp>
    );
  }

  // ── ConfirmStep ───────────────────────────────────────────────
  function ConfirmStep() {
    const { isGroup, freeInGroup } = slotAvailability(selTime!, selLocation);
    // Gruppe: freie Plätze in der Gruppe, der der Spieler beitritt. Individual
    // (1:1): nur „Verfügbar" — eine „X von Y"-Zählung verwirrt beim Einzeltraining.
    const availLabel = isGroup
      ? `${freeInGroup} von ${GROUP_SIZE} Plätzen frei`
      : 'Verfügbar';
    const doBook = async () => {
      setBookingError(null);
      const { error } = await addAppointment(selDate!, selTime!, selProgram!, selLocation);
      if (error) {
        setBookingError(error.message ?? 'Buchung fehlgeschlagen.');
      } else {
        setStep('done');
      }
    };
    const rows: [string, string][] = [
      ['Programm', currentProgram?.name ?? ''],
      ['Datum', fmtDate(selDate!)],
      ['Uhrzeit', `${selTime} Uhr`],
      ...(selLocation ? [['Standort', selLocation] as [string, string]] : []),
      ['Dauer', `${currentProgram?.duration ?? 60} Minuten`],
      ['Verfügbar', availLabel],
    ];
    return (
      <FadeUp>
        <BackBtn onPress={() => setStep('time')} />
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
        <Btn label="Jetzt buchen" onPress={doBook} variant="primary" style={{ marginBottom: 10 }} />
        <Btn label="Abbrechen" onPress={() => setStep('program')} variant="ghost" />
      </FadeUp>
    );
  }

  // ── DoneStep ──────────────────────────────────────────────────
  function DoneStep() {
    return (
      <Animated.View style={[styles.doneWrap, { opacity: doneFadeAnim.current, transform: [{ scale: doneScaleAnim.current }] }]}>
        <View style={styles.checkCircle}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
        <Text style={styles.doneTitle}>Buchung bestätigt!</Text>
        <Text style={styles.doneMeta}>{currentProgram?.name}</Text>
        <Text style={styles.doneMeta}>{fmtDate(selDate!)}</Text>
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

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: 'transparent' }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 28 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {step !== 'done' && header}
      {step !== 'done' && (
        <>
          <Text style={styles.bookingLabel}>Nachholtermin buchen</Text>
          <View style={styles.progress}>
            {STEPS.map((s, i) => (
              <View key={s} style={[styles.progressBar, { backgroundColor: i <= stepIdx ? C.accent : 'rgba(21,34,56,0.12)' }]} />
            ))}
          </View>
        </>
      )}
      {step === 'category' && CategoryStep()}
      {step === 'program' && ProgramStep()}
      {step === 'date' && DateStep()}
      {step === 'time' && TimeStep()}
      {step === 'confirm' && ConfirmStep()}
      {step === 'done' && DoneStep()}
    </ScrollView>
  );
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: 24 },
    bookingLabel: { fontSize: 13, fontWeight: '700', color: C.textFaint, letterSpacing: 0.1, marginBottom: 8, textTransform: 'uppercase' },
    progress: { flexDirection: 'row', gap: 5, marginBottom: 28 },
    progressBar: { flex: 1, height: 3, borderRadius: 2 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20, alignSelf: 'flex-start' },
    backArrow: { fontSize: 20, color: C.accent, fontWeight: '600' },
    backLabel: { fontSize: 15, fontWeight: '600', color: C.accent },
    sectionTitle: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
    sectionSub: { fontSize: 15, color: C.textFaint, marginTop: 4 },
    categoryCard: {
      backgroundColor: C.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.cardBorder,
      marginBottom: 12,
      overflow: 'hidden',
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    categoryAccentBar: { height: 4, width: '100%' },
    categoryContent: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 18 },
    categoryBody: { flex: 1 },
    categoryTag: { fontSize: 10, fontWeight: '700', color: C.textFaint, letterSpacing: 1.2, marginBottom: 6 },
    categoryName: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
    categorySub: { fontSize: 13, color: C.textMid, marginTop: 4 },
    categoryExpiry: { fontSize: 12, color: C.textFaint, marginTop: 8 },
    categoryArrow: { fontSize: 24, color: C.textFaint, fontWeight: '300', paddingLeft: 12 },
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
    monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: C.cardBorder },
    navBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.accentBg, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
    navBtnText: { fontSize: 20, fontWeight: '700', color: C.accent },
    monthLabel: { fontSize: 17, fontWeight: '700', color: C.text },
    calBody: { padding: 14, paddingBottom: 16 },
    weekRow: { flexDirection: 'row', marginBottom: 6 },
    weekCell: { flex: 1, alignItems: 'center' },
    weekLabel: { fontSize: 12, fontWeight: '700', color: C.textMid },
    dayGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: '14.28%', height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
    dayCellSelected: { backgroundColor: C.accent },
    dayCellToday: { backgroundColor: C.accentBg },
    dayText: { fontSize: 15, color: C.text, fontWeight: '400' },
    dayTextDisabled: { color: C.textFaint },
    dayTextSelected: { color: '#fff', fontWeight: '700' },
    dayTextToday: { color: C.accent, fontWeight: '700' },
    slotGroupLabel: { fontSize: 12, fontWeight: '700', color: C.textFaint, textTransform: 'uppercase', letterSpacing: 0.1, marginBottom: 10 },
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
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
    summaryRowBorder: { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
    summaryKey: { fontSize: 15, color: C.textMid },
    summaryVal: { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'right', maxWidth: '55%' },
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
    bookedDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.accentLight, marginTop: 2 },
    tokenDeadlineHint: {
      marginTop: 10, paddingHorizontal: 14, paddingVertical: 10,
      backgroundColor: C.accentBg, borderRadius: 10,
      borderWidth: 1, borderColor: C.cardBorder,
    },
    tokenDeadlineText: { fontSize: 13, color: C.textMid, fontWeight: '600', textAlign: 'center' },
    errorText: { fontSize: 14, color: C.red, textAlign: 'center', marginBottom: 12, fontWeight: '600' },
    tokenBanner: { backgroundColor: C.accentBg, borderRadius: 12, padding: 12, marginBottom: 14, gap: 6 },
    tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tokenIcon: { fontSize: 15 },
    tokenText: { fontSize: 13, fontWeight: '600', color: C.text, flex: 1 },
  });
}
