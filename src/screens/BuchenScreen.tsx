import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { Appointment, SlotCount, SlotPlayer, CancellationToken, Tab, TrainerSchedule, Player } from '../types';
import { todayStr } from '../utils/date';
import { PROGRAMS, PROGRAM_CATEGORY, ProgramId } from '../constants/programs';
import { canJoinGroupSlot, reconstructGroups } from '../utils/bookingRules';
import { useBlockedPeriods } from '../hooks/useBlockedPeriods';
import { LOCATIONS, Location } from '../constants/studio';
import { CategoryStep } from './buchen/CategoryStep';
import { ProgramStep } from './buchen/ProgramStep';
import { DateStep } from './buchen/DateStep';
import { TimeStep, SlotAvailability } from './buchen/TimeStep';
import { ConfirmStep } from './buchen/ConfirmStep';
import { DoneStep } from './buchen/DoneStep';

interface Props {
  slotCounts: SlotCount[];
  slotPlayers: SlotPlayer[];
  myAppointments: Appointment[];
  player: Player | null;
  activeTokens: CancellationToken[];
  // location ist Pflicht: der Slot bringt ihn immer mit (trainer_schedules.location
  // ist NOT NULL). Als optionaler Parameter ging er unterwegs verloren.
  addAppointment: (date: string, time: string, program: string, location: Location) => Promise<{ error: any }>;
  setTab: (t: Tab) => void;
  trainerSchedules?: TrainerSchedule[];
  trainers?: Array<{ id: string; trainer_specialty?: string | null }>;
  refreshSlotData?: () => Promise<void>;
  header?: React.ReactNode;
  /** Initial-Load läuft noch — Spinner statt „Kein Nachholtermin verfügbar". */
  loading?: boolean;
}

type Step = 'category' | 'program' | 'date' | 'time' | 'confirm' | 'done';

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

// Orchestriert den Buchungs-Wizard: hält den Wizard-State und die abgeleiteten
// Slot-Daten, die eigentlichen Schritte leben in src/screens/buchen/.
export function BuchenScreen({ slotCounts, slotPlayers, myAppointments, player, activeTokens, addAppointment, setTab, trainerSchedules = [], trainers = [], refreshSlotData, header, loading = false }: Props) {
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

  const ts = todayStr();
  const blockedPeriods = useBlockedPeriods();
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
  // Ergebnis pro (Uhrzeit, Standort) gecacht: der Zeit-Schritt fragt jeden Slot
  // zweimal ab (Filter + Anzeige), und reconstructGroups soll pro Slot und
  // Datenstand nur einmal laufen. Der Cache leert sich bei jeder Datenänderung.
  const availabilityCache = React.useMemo(
    () => new Map<string, SlotAvailability>(),
    [slotInfo, slotCounts, slotPlayers, selDate, selProgram, player],
  );
  const slotAvailability = (time: string, location: Location | null): SlotAvailability => {
    const cacheKey = `${time}|${location ?? ''}`;
    const cached = availabilityCache.get(cacheKey);
    if (cached) return cached;
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
    if (isGroup && !(playerBirthYear && playerLevel)) {
      // Ohne Jahrgang/Level ist die Gruppenregel nicht prüfbar. Früher lief die
      // Prüfung dann gar nicht und JEDER Slot galt als frei — ein Spieler ohne
      // Level konnte sich so in jede Gruppe buchen. Nicht prüfbar = nicht buchbar.
      groupUnavailable = true;
    } else if (isGroup) {
      const existingPlayers = slotPlayers
        .filter(p => p.date === selDate && p.time === time && p.program === selProgram)
        // Standort trennt Trainer, nicht Gruppen: ein Termin OHNE Standort kann
        // an jedem Standort sitzen und muss überall mitzählen. Ihn wegzufiltern
        // liess Gruppen leerer wirken als sie sind (Ursache der Fehlbuchungen).
        .filter(p => p.location == null || (p.location ?? null) === (location ?? null))
        // Fehlender Snapshot blockiert die Gruppe, statt sie zu öffnen: ein
        // unbekannter Mitspieler ist mit niemandem nachweislich kompatibel
        // (canJoinGroupSlot lehnt null ab).
        .map(p => ({
          birthYear: p.session_birth_year ?? null,
          level: (p.session_level ?? null) as any,
          created_at: p.created_at,
        }));
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

    const result = { totalCapacity, booked, isGroup, freeInGroup, groupUnavailable };
    availabilityCache.set(cacheKey, result);
    return result;
  };

  const allowedPrograms = player
    ? PROGRAMS.filter(p => isProgramAllowed(player, p.id))
    : [];

  const visiblePrograms = effectiveCategory
    ? allowedPrograms.filter(p => PROGRAM_CATEGORY[p.id] === effectiveCategory)
    : allowedPrograms;

  const activeToken = effectiveCategory === 'individual' ? tokenIndividual
    : effectiveCategory === 'gruppe' ? tokenGruppe
    : (tokenIndividual ?? tokenGruppe);
  // Fristdatum direkt aus dem UTC-Datumsteil von expires_at (= exakt 1 Monat
  // nach dem stornierten Termin, DST-sicher). NICHT new Date(...).toLocale… /
  // getDate() verwenden — das verschiebt in Berlin (UTC+1/+2) auf den Folgetag.
  const tokenMaxStr = activeToken ? activeToken.expires_at.slice(0, 10) : null;

  const doBook = async () => {
    setBookingError(null);
    if (!selLocation) {
      setBookingError('Für diesen Slot fehlt der Standort — bitte Uhrzeit erneut wählen.');
      return;
    }
    const { error } = await addAppointment(selDate!, selTime!, selProgram!, selLocation);
    if (error) {
      setBookingError(error.message ?? 'Buchung fehlgeschlagen.');
    } else {
      setStep('done');
    }
  };

  const confirmAvailLabel = (() => {
    if (step !== 'confirm' || !selTime) return '';
    const { isGroup, freeInGroup } = slotAvailability(selTime, selLocation);
    // Gruppe: freie Plätze in der Gruppe, der der Spieler beitritt. Individual
    // (1:1): nur „Verfügbar" — eine „X von Y"-Zählung verwirrt beim Einzeltraining.
    return isGroup ? `${freeInGroup} von ${GROUP_SIZE} Plätzen frei` : 'Verfügbar';
  })();

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
      {step === 'category' && (
        <CategoryStep
          tokenIndividual={tokenIndividual}
          tokenGruppe={tokenGruppe}
          onSelectCategory={cat => { setSelectedCategory(cat); setStep('program'); }}
        />
      )}
      {step === 'program' && (
        <ProgramStep
          loading={loading}
          hasTokens={activeTokens.length > 0}
          hasBothCategories={hasBothCategories}
          visiblePrograms={visiblePrograms}
          onBack={() => setStep('category')}
          onSelectProgram={id => { setSelProgram(id); setStep('date'); }}
        />
      )}
      {step === 'date' && (
        <DateStep
          programName={currentProgram?.name}
          programDuration={currentProgram?.duration}
          year={calY}
          month={calM}
          onPrevMonth={() => { const d = new Date(calY, calM - 1); setCalM(d.getMonth()); setCalY(d.getFullYear()); }}
          onNextMonth={() => { const d = new Date(calY, calM + 1); setCalM(d.getMonth()); setCalY(d.getFullYear()); }}
          todayStr={ts}
          selectedDate={selDate}
          tokenMaxStr={tokenMaxStr}
          blockedPeriods={blockedPeriods}
          myAppointments={myAppointments}
          onBack={() => setStep('program')}
          onSelectDate={ds => { setSelDate(ds); setStep('time'); }}
        />
      )}
      {step === 'time' && (
        <TimeStep
          selDate={selDate}
          todayStr={ts}
          isGroup={selProgram ? PROGRAM_CATEGORY[selProgram] === 'gruppe' : false}
          playerBirthYear={player?.birth_date ? parseInt(player.birth_date.slice(0, 4)) : null}
          playerLevel={player?.level ?? null}
          slotEntries={slotInfo.slotEntries}
          availableLocations={slotInfo.availableLocations}
          slotAvailability={slotAvailability}
          myAppointments={myAppointments}
          locFilter={locFilter}
          onLocFilter={f => { setLocFilter(f); setSelTime(null); setSelLocation(null); }}
          selTime={selTime}
          selLocation={selLocation}
          onSelectSlot={(time, location) => { setSelTime(time); setSelLocation(location); }}
          onNext={() => setStep('confirm')}
          onBack={() => setStep('date')}
        />
      )}
      {step === 'confirm' && selDate && selTime && (
        <ConfirmStep
          programName={currentProgram?.name}
          programDuration={currentProgram?.duration}
          selDate={selDate}
          selTime={selTime}
          selLocation={selLocation}
          availLabel={confirmAvailLabel}
          bookingError={bookingError}
          onBook={doBook}
          onBack={() => setStep('time')}
          onCancel={() => setStep('program')}
        />
      )}
      {step === 'done' && selDate && selTime && (
        <DoneStep
          programName={currentProgram?.name}
          selDate={selDate}
          selTime={selTime}
          selLocation={selLocation}
          setTab={setTab}
        />
      )}
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
  });
}
