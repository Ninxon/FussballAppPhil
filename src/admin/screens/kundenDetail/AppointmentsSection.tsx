import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Switch } from 'react-native';
import { CustomerProfile, AdminAppointment, TrainerProfile, MutationResult } from '../../hooks/useAdminData';
import { PROGRAMS, PROGRAM_CATEGORY, ProgramId } from '../../../constants/programs';
import { SLOTS } from '../../../constants/slots';
import { fmtDate } from '../../../utils/date';
import { generateRecurringDates, RecurrenceInterval } from '../../../utils/recurrence';
import { ApptRow } from './ApptRow';
import { styles } from './styles';

interface Props {
  customer: CustomerProfile;
  trainers: TrainerProfile[];
  todayStr: string;
  upcoming: AdminAppointment[];
  past: AdminAppointment[];
  /** Bestätigte Termine des Kunden — für das Tageslimit im Formular. */
  appointments: AdminAppointment[];
  onCancelAppointment: (id: string, reason?: string) => Promise<MutationResult>;
  onAddAppointment: (userId: string, date: string, time: string, program: string, trainerId?: string | null, skipGroupCompat?: boolean) => Promise<MutationResult>;
  onAddRecurring: (userId: string, dates: string[], time: string, program: string, trainerId?: string | null, skipGroupCompat?: boolean) => Promise<{ error: string | null; conflicts: { date: string; reason: string }[]; created: number }>;
}

// Termin-Karte: Einzel- und Serienbuchung sowie die Terminlisten.
export function AppointmentsSection({
  customer, trainers, todayStr: ts, upcoming, past, appointments,
  onCancelAppointment, onAddAppointment, onAddRecurring,
}: Props) {
  const [showBooking, setShowBooking] = useState(false);
  const [bookDate, setBookDate] = useState('');
  const [bookProgram, setBookProgram] = useState<string>(PROGRAMS[0].id);
  const [bookTime, setBookTime] = useState(SLOTS[0]);
  const [bookTrainerId, setBookTrainerId] = useState<string | null>(trainers[0]?.id ?? null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  // Einmalige Befreiung von der Alters-/Level-Prüfung nur für diese Buchung.
  const [bookSkipCompat, setBookSkipCompat] = useState(false);

  const [bookRecurring, setBookRecurring] = useState(false);
  const [recInterval, setRecInterval] = useState<RecurrenceInterval>('weekly');
  const [recEndType, setRecEndType] = useState<'count' | 'until'>('count');
  const [recCount, setRecCount] = useState('8');
  const [recUntil, setRecUntil] = useState('');
  const [recResult, setRecResult] = useState<{ created: number; conflicts: { date: string; reason: string }[] } | null>(null);

  const birthYear = customer.birth_date ? parseInt(customer.birth_date.slice(0, 4)) : null;

  // Vorschau der Serien-Daten (auch für den Button-Text), nur bei gültigem Startdatum.
  const seriesDates = bookRecurring && bookDate.match(/^\d{4}-\d{2}-\d{2}$/)
    ? generateRecurringDates(
        bookDate, recInterval,
        recEndType === 'count'
          ? { type: 'count', count: parseInt(recCount, 10) || 0 }
          : { type: 'until', date: recUntil },
      )
    : [];

  const doBook = async () => {
    setBookingError(null);
    setRecResult(null);
    if (!bookDate.match(/^\d{4}-\d{2}-\d{2}$/)) { setBookingError('Format: YYYY-MM-DD'); return; }
    if (isNaN(new Date(bookDate).getTime())) { setBookingError('Ungültiges Datum.'); return; }
    if (bookDate < ts) { setBookingError('Datum darf nicht in der Vergangenheit liegen.'); return; }
    if (!bookTrainerId) { setBookingError('Bitte einen Trainer auswählen.'); return; }

    if (bookRecurring) {
      if (recEndType === 'count') {
        const n = parseInt(recCount, 10);
        if (!n || n < 1) { setBookingError('Bitte eine gültige Anzahl Termine angeben.'); return; }
        if (n > 100) { setBookingError('Maximal 100 Termine pro Serie.'); return; }
      } else {
        if (!recUntil.match(/^\d{4}-\d{2}-\d{2}$/)) { setBookingError('Bis-Datum im Format YYYY-MM-DD angeben.'); return; }
        if (recUntil < bookDate) { setBookingError('Bis-Datum muss nach dem Startdatum liegen.'); return; }
      }
      if (seriesDates.length === 0) { setBookingError('Keine Termine im gewählten Zeitraum.'); return; }
      setBookingLoading(true);
      const { error, conflicts, created } = await onAddRecurring(customer.id, seriesDates, bookTime, bookProgram, bookTrainerId, bookSkipCompat);
      setBookingLoading(false);
      if (error) { setBookingError(error); return; }
      if (conflicts.length > 0) { setRecResult({ created: 0, conflicts }); return; }
      setRecResult({ created, conflicts: [] });
      setShowBooking(false); setBookDate(''); setBookingError(null);
      setBookTrainerId(trainers[0]?.id ?? null); setBookRecurring(false); setBookSkipCompat(false);
      return;
    }

    const confirmedOnDay = appointments.filter(a => a.date === bookDate && a.status === 'confirmed');
    if (confirmedOnDay.length >= 2) { setBookingError('Bereits zwei Termine an diesem Tag.'); return; }
    setBookingLoading(true);
    const { error } = await onAddAppointment(customer.id, bookDate, bookTime, bookProgram, bookTrainerId, bookSkipCompat);
    setBookingLoading(false);
    if (error) setBookingError(error);
    else { setShowBooking(false); setBookDate(''); setBookingError(null); setBookTrainerId(trainers[0]?.id ?? null); setBookSkipCompat(false); }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle}>Termine</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (!showBooking) setBookTrainerId(trainers[0]?.id ?? null);
            setShowBooking(v => !v);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.addBtnText}>{showBooking ? '✕ Abbrechen' : '+ Termin buchen'}</Text>
        </TouchableOpacity>
      </View>

      {showBooking && (
        <View style={styles.formSection}>
          <Text style={styles.fieldLabel}>Datum (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={bookDate} onChangeText={setBookDate} placeholder="2026-05-01" placeholderTextColor="#7A90AE" />

          <Text style={styles.fieldLabel}>Training</Text>
          <View style={styles.programRow}>
            {PROGRAMS.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.programChip, bookProgram === p.id && styles.programChipActive]}
                onPress={() => setBookProgram(p.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.programChipText, bookProgram === p.id && styles.programChipTextActive]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Uhrzeit</Text>
          <View style={styles.slotRow}>
            {SLOTS.map(t => {
              const now = new Date();
              const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
              const isPast = bookDate === ts && t <= nowStr;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.slotChip, bookTime === t && styles.slotChipActive, isPast && styles.slotChipDisabled]}
                  onPress={() => !isPast && setBookTime(t)}
                  activeOpacity={isPast ? 1 : 0.7}
                  disabled={isPast}
                >
                  <Text style={[styles.slotChipText, bookTime === t && styles.slotChipTextActive, isPast && styles.slotChipTextDisabled]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Trainer *</Text>
          {trainers.length === 0 ? (
            <View style={styles.birthYearWarning}>
              <Text style={styles.birthYearWarningText}>Hinweis: Kein Trainer vorhanden. Bitte zuerst einen Trainer anlegen.</Text>
            </View>
          ) : (
            <View style={styles.slotRow}>
              {trainers.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.slotChip, bookTrainerId === t.id && styles.slotChipActive]}
                  onPress={() => setBookTrainerId(t.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.slotChipText, bookTrainerId === t.id && styles.slotChipTextActive]}>{t.full_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.recurToggleRow}>
            <Text style={styles.permLabel}>Fortlaufend wiederholen</Text>
            <Switch
              value={bookRecurring}
              onValueChange={setBookRecurring}
              trackColor={{ false: '#E5E7EB', true: '#4A8FE8' }}
              thumbColor="#fff"
            />
          </View>

          {bookRecurring && (
            <View style={styles.recurBox}>
              <Text style={styles.fieldLabel}>Intervall</Text>
              <View style={styles.slotRow}>
                {([['weekly', 'Wöchentlich'], ['biweekly', '14-tägig'], ['monthly', 'Monatlich']] as [RecurrenceInterval, string][]).map(([id, label]) => (
                  <TouchableOpacity
                    key={id}
                    style={[styles.slotChip, recInterval === id && styles.slotChipActive]}
                    onPress={() => setRecInterval(id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.slotChipText, recInterval === id && styles.slotChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Ende der Serie</Text>
              <View style={styles.slotRow}>
                <TouchableOpacity
                  style={[styles.slotChip, recEndType === 'count' && styles.slotChipActive]}
                  onPress={() => setRecEndType('count')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.slotChipText, recEndType === 'count' && styles.slotChipTextActive]}>Anzahl Termine</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.slotChip, recEndType === 'until' && styles.slotChipActive]}
                  onPress={() => setRecEndType('until')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.slotChipText, recEndType === 'until' && styles.slotChipTextActive]}>Bis-Datum</Text>
                </TouchableOpacity>
              </View>

              {recEndType === 'count' ? (
                <TextInput style={styles.input} value={recCount} onChangeText={setRecCount} keyboardType="number-pad" placeholder="8" placeholderTextColor="#7A90AE" />
              ) : (
                <TextInput style={styles.input} value={recUntil} onChangeText={setRecUntil} placeholder="2026-07-31" placeholderTextColor="#7A90AE" />
              )}

              {seriesDates.length > 0 && (
                <Text style={styles.recurPreview}>
                  Erzeugt {seriesDates.length} Termin{seriesDates.length === 1 ? '' : 'e'}: {seriesDates.slice(0, 6).map(fmtDate).join(', ')}{seriesDates.length > 6 ? ` … (+${seriesDates.length - 6})` : ''}
                </Text>
              )}
            </View>
          )}

          {PROGRAM_CATEGORY[bookProgram as ProgramId] === 'gruppe' && !birthYear && (
            <View style={styles.birthYearWarning}>
              <Text style={styles.birthYearWarningText}>Hinweis: Bitte zuerst Geburtsdatum im Profil eintragen (wird für Gruppenkompatibilität benötigt).</Text>
            </View>
          )}

          {PROGRAM_CATEGORY[bookProgram as ProgramId] === 'gruppe' && !customer.skip_group_age_level_check && (
            <View style={styles.recurToggleRow}>
              <Text style={styles.permLabel}>Sonderregel: Alters-/Level-Prüfung für diese Buchung übergehen</Text>
              <Switch
                value={bookSkipCompat}
                onValueChange={setBookSkipCompat}
                trackColor={{ false: '#E5E7EB', true: '#F5A84A' }}
                thumbColor="#fff"
              />
            </View>
          )}

          {bookingError && <Text style={styles.fieldError}>{bookingError}</Text>}
          <TouchableOpacity
            style={[styles.saveBtn, (bookingLoading || trainers.length === 0) && { opacity: 0.5 }]}
            onPress={doBook}
            activeOpacity={0.7}
            disabled={bookingLoading || trainers.length === 0}
          >
            <Text style={styles.saveBtnText}>
              {bookingLoading
                ? 'Buchen...'
                : bookRecurring
                  ? (seriesDates.length > 0 ? `${seriesDates.length} Termine buchen` : 'Serie buchen')
                  : 'Termin buchen'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {recResult && recResult.conflicts.length > 0 && (
        <View style={styles.recurConflictBox}>
          <Text style={styles.recurConflictTitle}>
            Serie nicht gebucht — {recResult.conflicts.length} Konflikt{recResult.conflicts.length === 1 ? '' : 'e'} (alles oder nichts):
          </Text>
          {recResult.conflicts.map(c => (
            <Text key={c.date} style={styles.recurConflictItem}>• {fmtDate(c.date)}: {c.reason}</Text>
          ))}
        </View>
      )}
      {recResult && recResult.created > 0 && (
        <View style={styles.recurSuccessBox}>
          <Text style={styles.recurSuccessText}>{recResult.created} Termine erfolgreich angelegt.</Text>
        </View>
      )}

      {upcoming.length > 0 && (
        <>
          <Text style={styles.apptSection}>Bevorstehend</Text>
          {upcoming.map(a => <ApptRow key={a.id} appt={a} onCancel={onCancelAppointment} />)}
        </>
      )}
      {past.length > 0 && (
        <>
          <Text style={[styles.apptSection, { marginTop: 16 }]}>Vergangen</Text>
          {past.map(a => <ApptRow key={a.id} appt={a} />)}
        </>
      )}
      {upcoming.length === 0 && past.length === 0 && !showBooking && (
        <Text style={styles.emptyAppt}>Keine Termine vorhanden.</Text>
      )}
    </View>
  );
}
