import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { CustomerProfile, TrainerProfile, MutationResult } from '../../hooks/useAdminData';
import { SlotReservation, SlotReservationInsert, ReservationProgram, TrainerSchedule, Location } from '../../../types';
import { LOCATIONS } from '../../../constants/studio';
import { SLOTS } from '../../../constants/slots';
import { SectionCard } from './ui';
import { styles } from './styles';

interface Props {
  customer: CustomerProfile;
  /** Alle Stammplätze — für die Belegung des gewählten Slots. */
  slotReservations: SlotReservation[];
  trainers: TrainerProfile[];
  trainerSchedules: TrainerSchedule[];
  onAddReservation: (row: SlotReservationInsert) => Promise<MutationResult>;
  onRemoveReservation: (id: string) => Promise<MutationResult>;
}

const DAYS: [number, string][] = [
  [1, 'Montag'], [2, 'Dienstag'], [3, 'Mittwoch'], [4, 'Donnerstag'], [5, 'Freitag'],
];

const PROGRAM_LABEL: Record<ReservationProgram, string> = {
  individual: 'Individualtraining',
  torhueter_individual: 'Torwart Individual',
};

const specialtyOf = (p: ReservationProgram) =>
  p === 'torhueter_individual' ? 'torwart' : 'spieler';

/**
 * Fester Trainingsplatz ("Stammplatz"): hält einen wiederkehrenden Einzeltraining-
 * Slot für dieses Kind frei, damit ihn kein Nachholtermin wegschnappt, während die
 * nächste Blockbuchung noch überlegt wird.
 *
 * Der Platz erzeugt KEINE Termine — das Kind bucht weiter selbst. Er gilt
 * unbefristet, bis er hier entfernt wird.
 */
export function StammplatzSection({
  customer, slotReservations, trainers, trainerSchedules,
  onAddReservation, onRemoveReservation,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [day, setDay] = useState(1);
  const [time, setTime] = useState(SLOTS[0]);
  const [program, setProgram] = useState<ReservationProgram>(
    customer.player_type === 'torwart' ? 'torhueter_individual' : 'individual',
  );
  const [location, setLocation] = useState<Location | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = slotReservations
    .filter(r => r.player_id === customer.id)
    .sort((a, b) => a.day_of_week - b.day_of_week || a.time.localeCompare(b.time));

  // Nur Standorte anbieten, an denen zu dieser Zeit ein passender Trainer steht —
  // sonst lehnt die Datenbank die Reservierung ohnehin ab.
  const specialty = specialtyOf(program);
  const trainerIds = trainers
    .filter(t => (t.trainer_specialty ?? 'spieler') === specialty)
    .map(t => t.id);
  const slotsHere = trainerSchedules.filter(
    s => trainerIds.includes(s.trainer_id) && s.day_of_week === day && s.time === time,
  );

  const capacityAt = (loc: Location) => {
    const total = slotsHere.filter(s => s.location === loc).length;
    const taken = slotReservations.filter(
      r => r.day_of_week === day && r.time === time && r.location === loc &&
           specialtyOf(r.program) === specialty,
    ).length;
    return { total, free: total - taken };
  };

  const doAdd = async () => {
    setError(null);
    if (!location) { setError('Bitte einen Standort wählen.'); return; }
    setSaving(true);
    const res = await onAddReservation({
      player_id: customer.id,
      day_of_week: day,
      time,
      location,
      program,
      note: note.trim() || null,
    });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setShowForm(false);
    setLocation(null);
    setNote('');
  };

  return (
    <SectionCard title="Fester Trainingsplatz">
      <Text style={styles.grantSub}>
        Hält einen Einzeltraining-Slot dauerhaft für dieses Kind frei. Es entstehen keine
        Termine — gebucht wird weiterhin normal. Der Platz gilt, bis er hier entfernt wird.
      </Text>

      {mine.length === 0 ? (
        <Text style={styles.noLevel}>Kein fester Platz hinterlegt.</Text>
      ) : (
        mine.map(r => (
          <View key={r.id} style={styles.apptRow}>
            <View style={styles.apptInfo}>
              <Text style={styles.apptProg}>
                {DAYS.find(([d]) => d === r.day_of_week)?.[1]} · {r.time} Uhr
              </Text>
              <Text style={styles.apptDate}>
                {PROGRAM_LABEL[r.program]} · {r.location}{r.note ? ` · ${r.note}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.stornBtn}
              onPress={() => onRemoveReservation(r.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.stornText}>Entfernen</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      {showForm ? (
        <View style={[styles.formSection, { marginTop: 14, marginBottom: 0 }]}>
          <Text style={styles.fieldLabel}>Training</Text>
          <View style={styles.programRow}>
            {(Object.keys(PROGRAM_LABEL) as ReservationProgram[]).map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.programChip, program === p && styles.programChipActive]}
                onPress={() => { setProgram(p); setLocation(null); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.programChipText, program === p && styles.programChipTextActive]}>
                  {PROGRAM_LABEL[p]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Wochentag</Text>
          <View style={styles.slotRow}>
            {DAYS.map(([d, label]) => (
              <TouchableOpacity
                key={d}
                style={[styles.slotChip, day === d && styles.slotChipActive]}
                onPress={() => { setDay(d); setLocation(null); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.slotChipText, day === d && styles.slotChipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Uhrzeit</Text>
          <View style={styles.slotRow}>
            {SLOTS.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.slotChip, time === t && styles.slotChipActive]}
                onPress={() => { setTime(t); setLocation(null); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.slotChipText, time === t && styles.slotChipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Standort</Text>
          <View style={styles.slotRow}>
            {LOCATIONS.map(loc => {
              const { total, free } = capacityAt(loc);
              // Ohne freien Trainerplatz gäbe es zwei "garantierte" Plätze auf
              // einem Trainer — die Datenbank lehnt das ab, hier bleibt der Chip aus.
              const disabled = free <= 0;
              return (
                <TouchableOpacity
                  key={loc}
                  style={[styles.slotChip, location === loc && styles.slotChipActive, disabled && styles.slotChipDisabled]}
                  onPress={() => !disabled && setLocation(loc)}
                  disabled={disabled}
                  activeOpacity={disabled ? 1 : 0.7}
                >
                  <Text style={[styles.slotChipText, location === loc && styles.slotChipTextActive, disabled && styles.slotChipTextDisabled]}>
                    {loc} {total === 0 ? '(kein Trainer)' : `(${free}/${total} frei)`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Notiz (optional)</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="z. B. 4er-Block, Verlängerung offen"
            placeholderTextColor="#7A90AE"
          />

          {error && <Text style={styles.fieldError}>{error}</Text>}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.5 }]}
            onPress={doAdd}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Speichert…' : 'Platz freihalten'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.grantBtn}
          onPress={() => { setShowForm(true); setError(null); }}
          activeOpacity={0.7}
        >
          <Text style={styles.grantBtnText}>+ Festen Platz hinzufügen</Text>
        </TouchableOpacity>
      )}
    </SectionCard>
  );
}
