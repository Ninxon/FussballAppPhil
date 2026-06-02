import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch,
} from 'react-native';
import { CustomerProfile, AdminAppointment, TrainerProfile } from '../hooks/useAdminData';
import { PlayerLevel, PlayerType, LEVEL_COLORS, LEVEL_LABELS, BookingPermissions } from '../../types';
import { PROGRAMS, PROGRAM_CATEGORY, ProgramId } from '../../constants/programs';
import { SLOTS } from '../../constants/slots';
import { todayStr, fmtDate } from '../../constants/i18n';
import { LOCATIONS, Location } from '../../constants/studio';
import { generateRecurringDates, RecurrenceInterval } from '../../utils/recurrence';

const PROGRAM_COLORS: Record<string, string> = {
  individual: '#4A8FE8', gruppe: '#3DBFA0', athletik: '#F5A84A',
  torhueter_individual: '#E87676', torhueter_gruppe: '#9B59B6',
};

const LEVELS: PlayerLevel[] = ['anfaenger', 'amateur', 'profi', 'experte'];

const PERMISSION_FLAGS: { key: keyof BookingPermissions; label: string }[] = [
  { key: 'can_book_individual', label: 'Individualtraining' },
  { key: 'can_book_gruppe', label: 'Gruppentraining' },
  { key: 'can_book_athletik', label: 'Athletiktraining' },
  { key: 'can_book_torhueter_individual', label: 'Torwart Individual' },
  { key: 'can_book_torhueter_gruppe', label: 'Torwart Gruppe' },
];

const PLAYER_TYPE_OPTIONS: { id: PlayerType; label: string }[] = [
  { id: 'feldspieler', label: 'Feldspieler' },
  { id: 'torwart', label: 'Torwart' },
];

interface Props {
  customer: CustomerProfile;
  appointments: AdminAppointment[];
  trainers: TrainerProfile[];
  tokenCounts?: { individual: number; gruppe: number };
  onBack: () => void;
  onCancelAppointment: (id: string) => Promise<{ error: any }>;
  onAddAppointment: (userId: string, date: string, time: string, program: string, trainerId?: string | null, skipGroupCompat?: boolean) => Promise<{ error: any }>;
  onAddRecurring: (userId: string, dates: string[], time: string, program: string, trainerId?: string | null, skipGroupCompat?: boolean) => Promise<{ error: { message: string } | null; conflicts: { date: string; reason: string }[]; created: number }>;
  onSaveLevel: (customerId: string, level: PlayerLevel | null) => Promise<{ error: any }>;
  onSaveBookingPermissions: (customerId: string, permissions: Partial<BookingPermissions>) => Promise<{ error: any }>;
  onSaveGroupExempt: (customerId: string, value: boolean) => Promise<{ error: any }>;
  onSaveProfile: (customerId: string, fields: Partial<Pick<CustomerProfile, 'full_name' | 'player_type' | 'parent_name' | 'location' | 'birth_date' | 'phone' | 'address'>>) => Promise<{ error: any }>;
  onSaveEmail: (customerId: string, email: string) => Promise<{ error: { message: string } | null }>;
  onToggleActive: (customerId: string, isActive: boolean) => Promise<{ error: any }>;
  onResetTokens: (customerId: string) => Promise<{ error: any }>;
  onMarkAttended: (apptId: string, attended: boolean | null) => Promise<{ error: any }>;
  onDeleteCustomer: (id: string) => Promise<{ error: string | null }>;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ApptRow({ appt, onCancel }: { appt: AdminAppointment; onCancel?: (id: string) => void }) {
  const prog = PROGRAMS.find(p => p.id === appt.program);
  const color = PROGRAM_COLORS[appt.program] ?? '#4A8FE8';
  const ts = todayStr();
  const isUpcoming = appt.status === 'confirmed' && appt.date >= ts;
  const dimmed = appt.status === 'cancelled' || appt.date < ts;
  return (
    <View style={[styles.apptRow, dimmed && { opacity: 0.5 }]}>
      <View style={[styles.apptColorBar, { backgroundColor: dimmed ? '#D1D5DB' : color }]} />
      <View style={styles.apptInfo}>
        <Text style={[styles.apptProg, { color: appt.status === 'cancelled' ? '#7A90AE' : color }]}>{prog?.name ?? appt.program}</Text>
        <Text style={styles.apptDate}>{fmtDate(appt.date)} · {appt.time} Uhr</Text>
      </View>
      {appt.status === 'cancelled' && (
        <View style={styles.cancelledBadge}><Text style={styles.cancelledText}>Storniert</Text></View>
      )}
      {isUpcoming && onCancel && (
        <TouchableOpacity style={styles.stornBtn} onPress={() => onCancel(appt.id)} activeOpacity={0.7}>
          <Text style={styles.stornText}>Stornieren</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function KundenDetailScreen({
  customer, appointments, trainers, tokenCounts,
  onBack, onCancelAppointment, onAddAppointment, onAddRecurring,
  onSaveLevel, onSaveBookingPermissions, onSaveGroupExempt, onSaveProfile, onSaveEmail,
  onToggleActive, onResetTokens, onMarkAttended, onDeleteCustomer,
}: Props) {
  const ts = todayStr();

  const birthYear = customer.birth_date ? parseInt(customer.birth_date.slice(0, 4)) : null;

  // Termin buchen
  const [showBooking, setShowBooking] = useState(false);
  const [bookDate, setBookDate] = useState('');
  const [bookProgram, setBookProgram] = useState<string>(PROGRAMS[0].id);
  const [bookTime, setBookTime] = useState(SLOTS[0]);
  const [bookTrainerId, setBookTrainerId] = useState<string | null>(trainers[0]?.id ?? null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  // Einmalige Befreiung von der Alters-/Level-Prüfung nur für diese Buchung.
  const [bookSkipCompat, setBookSkipCompat] = useState(false);

  // Serien-/Folgebuchung
  const [bookRecurring, setBookRecurring] = useState(false);
  const [recInterval, setRecInterval] = useState<RecurrenceInterval>('weekly');
  const [recEndType, setRecEndType] = useState<'count' | 'until'>('count');
  const [recCount, setRecCount] = useState('8');
  const [recUntil, setRecUntil] = useState('');
  const [recResult, setRecResult] = useState<{ created: number; conflicts: { date: string; reason: string }[] } | null>(null);

  // Level
  const [levelLoading, setLevelLoading] = useState(false);
  const [levelError, setLevelError] = useState<string | null>(null);

  // Berechtigungen
  const [permLoading, setPermLoading] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);

  // Profil-Bearbeitung
  const [editProfile, setEditProfile] = useState(false);
  const [editFullName, setEditFullName] = useState(customer.full_name ?? '');
  const [editEmail, setEditEmail] = useState(customer.email ?? '');
  const [editPhone, setEditPhone] = useState(customer.phone ?? '');
  const [editAddress, setEditAddress] = useState(customer.address ?? '');
  const [editPlayerType, setEditPlayerType] = useState<PlayerType | null>(customer.player_type);
  const [editParentName, setEditParentName] = useState(customer.parent_name ?? '');
  const [editLocation, setEditLocation] = useState<Location | null>((customer.location as Location) ?? null);
  const [editBirthDate, setEditBirthDate] = useState(customer.birth_date ?? '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Aktiv-Status + Token-Reset
  const [activeLoading, setActiveLoading] = useState(false);
  const [showTokenReset, setShowTokenReset] = useState(false);
  const [tokenResetLoading, setTokenResetLoading] = useState(false);
  const [tokenResetError, setTokenResetError] = useState<string | null>(null);

  // Löschen
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmedTotal = appointments.filter(a => a.status === 'confirmed').length;

  const upcoming = appointments
    .filter(a => a.date >= ts && a.status === 'confirmed')
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const past = appointments
    .filter(a => a.date < ts || a.status === 'cancelled')
    .sort((a, b) => b.date.localeCompare(a.date));

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
      if (error) { setBookingError(error.message); return; }
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
    if (error) setBookingError(error.message ?? 'Buchung fehlgeschlagen.');
    else { setShowBooking(false); setBookDate(''); setBookingError(null); setBookTrainerId(trainers[0]?.id ?? null); setBookSkipCompat(false); }
  };

  const doSetLevel = async (level: PlayerLevel | null) => {
    setLevelLoading(true);
    setLevelError(null);
    const { error } = await onSaveLevel(customer.id, level);
    setLevelLoading(false);
    if (error) setLevelError(error.message ?? 'Fehler beim Speichern.');
  };

  const doTogglePermission = async (key: keyof BookingPermissions, value: boolean) => {
    setPermError(null);
    const { error } = await onSaveBookingPermissions(customer.id, { [key]: value });
    if (error) setPermError(error.message ?? 'Fehler beim Speichern.');
  };

  const doToggleGroupExempt = async (value: boolean) => {
    setPermError(null);
    const { error } = await onSaveGroupExempt(customer.id, value);
    if (error) setPermError(error.message ?? 'Fehler beim Speichern.');
  };

  const doSaveProfile = async () => {
    if (!editFullName.trim()) { setProfileError('Name ist ein Pflichtfeld.'); return; }
    const emailTrimmed = editEmail.trim();
    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setProfileError('Bitte eine gültige E-Mail-Adresse eingeben.');
      return;
    }
    if (!editLocation) { setProfileError('Bitte einen Standort auswählen.'); return; }
    if (editBirthDate.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const d = new Date(editBirthDate.trim());
      if (!dateRegex.test(editBirthDate.trim()) || isNaN(d.getTime()) || d > new Date()) {
        setProfileError('Geburtsdatum muss im Format YYYY-MM-DD und in der Vergangenheit liegen.');
        return;
      }
    }
    setProfileLoading(true);
    setProfileError(null);
    const { error } = await onSaveProfile(customer.id, {
      full_name: editFullName.trim(),
      player_type: editPlayerType,
      parent_name: editParentName.trim() || null,
      location: editLocation,
      birth_date: editBirthDate.trim() || null,
      phone: editPhone.trim(),
      address: editAddress.trim() || null,
    });
    if (error) {
      setProfileLoading(false);
      setProfileError((error as any).message ?? 'Fehler beim Speichern.');
      return;
    }
    // E-Mail nur bei Änderung — zieht den Auth-User über die Edge Function mit.
    if (emailTrimmed.toLowerCase() !== (customer.email ?? '').toLowerCase()) {
      const { error: mailErr } = await onSaveEmail(customer.id, emailTrimmed);
      if (mailErr) {
        setProfileLoading(false);
        setProfileError(`Profil gespeichert, aber E-Mail-Änderung fehlgeschlagen: ${mailErr.message}`);
        return;
      }
    }
    setProfileLoading(false);
    setEditProfile(false);
  };

  const doToggleActive = async (value: boolean) => {
    setActiveLoading(true);
    await onToggleActive(customer.id, value);
    setActiveLoading(false);
  };

  const doResetTokens = async () => {
    setTokenResetLoading(true);
    setTokenResetError(null);
    const { error } = await onResetTokens(customer.id);
    setTokenResetLoading(false);
    if (error) setTokenResetError((error as any).message ?? 'Fehler beim Zurücksetzen.');
    else setShowTokenReset(false);
  };

  const doDelete = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    const { error } = await onDeleteCustomer(customer.id);
    setDeleteLoading(false);
    if (error) setDeleteError(error);
  };

  const isTorwart = customer.player_type === 'torwart';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Text style={styles.backArrow}>‹</Text>
        <Text style={styles.backLabel}>Zurück zur Spielerliste</Text>
      </TouchableOpacity>

      <View style={styles.pageHeader}>
        <View style={[styles.avatar, { backgroundColor: isTorwart ? 'rgba(155,89,182,0.12)' : 'rgba(74,143,232,0.12)' }]}>
          <Text style={[styles.avatarLetter, { color: isTorwart ? '#9B59B6' : '#4A8FE8' }]}>
            {isTorwart ? 'T' : 'F'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.customerName}>{customer.full_name}</Text>
          <Text style={styles.customerSub}>
            {isTorwart ? 'Torwart' : customer.player_type === 'feldspieler' ? 'Feldspieler' : 'Spieler'} #{customer.customer_number}
            {birthYear ? ` · Jg. ${birthYear}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteHeaderBtn}
          onPress={() => { setShowDeleteConfirm(true); setDeleteError(null); }}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteHeaderBtnText}>Löschen</Text>
        </TouchableOpacity>
      </View>

      {showDeleteConfirm && (
        <View style={styles.deleteConfirmBox}>
          <Text style={styles.deleteConfirmTitle}>Spieler unwiderruflich löschen?</Text>
          <Text style={styles.deleteConfirmSub}>
            Alle Daten von <Text style={{ fontWeight: '700' }}>{customer.full_name}</Text> werden dauerhaft gelöscht.
          </Text>
          {deleteError && <Text style={styles.deleteError}>{deleteError}</Text>}
          <View style={styles.deleteConfirmBtns}>
            <TouchableOpacity style={[styles.deleteConfirmYes, deleteLoading && { opacity: 0.6 }]} onPress={doDelete} disabled={deleteLoading} activeOpacity={0.7}>
              <Text style={styles.deleteConfirmYesText}>{deleteLoading ? 'Wird gelöscht...' : 'Ja, endgültig löschen'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteConfirmNo} onPress={() => setShowDeleteConfirm(false)} activeOpacity={0.7}>
              <Text style={styles.deleteConfirmNoText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Kontaktdaten */}
      <SectionCard title="Kontaktdaten">
        {editProfile ? (
          <View style={styles.editSection}>
            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput style={styles.editInput} value={editFullName} onChangeText={setEditFullName} placeholder="Max Mustermann" placeholderTextColor="#7A90AE" />
            <Text style={styles.fieldLabel}>E-Mail *</Text>
            <TextInput style={styles.editInput} value={editEmail} onChangeText={setEditEmail} placeholder="max@beispiel.de" placeholderTextColor="#7A90AE" keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.fieldLabel}>Spielertyp</Text>
            <View style={styles.typeRow}>
              {PLAYER_TYPE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.typeChip, editPlayerType === opt.id && styles.typeChipActive]}
                  onPress={() => setEditPlayerType(opt.id)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.typeChipAvatar,
                    { backgroundColor: opt.id === 'torwart' ? 'rgba(155,89,182,0.15)' : 'rgba(74,143,232,0.15)' },
                  ]}>
                    <Text style={[
                      styles.typeChipAvatarText,
                      { color: opt.id === 'torwart' ? '#9B59B6' : '#4A8FE8' },
                    ]}>
                      {opt.id === 'torwart' ? 'T' : 'F'}
                    </Text>
                  </View>
                  <Text style={[styles.typeChipText, editPlayerType === opt.id && styles.typeChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Elternname</Text>
            <TextInput style={styles.editInput} value={editParentName} onChangeText={setEditParentName} placeholder="Elternname" placeholderTextColor="#7A90AE" />
            <Text style={styles.fieldLabel}>Telefon</Text>
            <TextInput style={styles.editInput} value={editPhone} onChangeText={setEditPhone} placeholder="0170 1234567" placeholderTextColor="#7A90AE" keyboardType="phone-pad" />
            <Text style={styles.fieldLabel}>Adresse</Text>
            <TextInput style={styles.editInput} value={editAddress} onChangeText={setEditAddress} placeholder="Musterstr. 1, 12345 Stadt" placeholderTextColor="#7A90AE" />
            <Text style={styles.fieldLabel}>Standort *</Text>
            <View style={styles.typeRow}>
              {LOCATIONS.map(loc => (
                <TouchableOpacity
                  key={loc}
                  style={[styles.typeChip, editLocation === loc && styles.typeChipActive]}
                  onPress={() => setEditLocation(loc)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.typeChipText, editLocation === loc && styles.typeChipTextActive]}>{loc}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Geburtsdatum (YYYY-MM-DD)</Text>
            <TextInput style={styles.editInput} value={editBirthDate} onChangeText={setEditBirthDate} placeholder="2010-05-15" placeholderTextColor="#7A90AE" />
            {profileError && <Text style={styles.fieldError}>{profileError}</Text>}
            <View style={styles.editBtns}>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1 }, profileLoading && { opacity: 0.6 }]} onPress={doSaveProfile} disabled={profileLoading} activeOpacity={0.7}>
                <Text style={styles.saveBtnText}>{profileLoading ? 'Speichern...' : 'Speichern'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelEditBtn, { flex: 1 }]} onPress={() => setEditProfile(false)} activeOpacity={0.7}>
                <Text style={styles.cancelEditText}>Abbrechen</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.activeRow}>
              <View style={styles.activeRowLeft}>
                <View style={[styles.statusDot, { backgroundColor: customer.is_active ? '#22C55E' : '#9CA3AF' }]} />
                <Text style={styles.activeLabel}>{customer.is_active ? 'Aktiv' : 'Inaktiv'}</Text>
              </View>
              <Switch
                value={customer.is_active}
                onValueChange={doToggleActive}
                disabled={activeLoading}
                trackColor={{ false: '#E5E7EB', true: '#22C55E' }}
                thumbColor="#fff"
              />
            </View>
            <InfoRow label="E-Mail" value={customer.email} />
            <InfoRow label="Telefon" value={customer.phone} />
            {customer.parent_name && <InfoRow label="Elternname" value={customer.parent_name} />}
            <InfoRow label="Geburtsdatum" value={customer.birth_date} />
            {birthYear && <InfoRow label="Jahrgang" value={String(birthYear)} />}
            {customer.location && <InfoRow label="Standort" value={customer.location} />}
            <InfoRow label="Spielertyp" value={isTorwart ? 'Torwart' : customer.player_type === 'feldspieler' ? 'Feldspieler' : '—'} />
            <TouchableOpacity
              style={styles.editProfileBtn}
              onPress={() => {
                setEditFullName(customer.full_name ?? '');
                setEditEmail(customer.email ?? '');
                setEditPhone(customer.phone ?? '');
                setEditAddress(customer.address ?? '');
                setEditPlayerType(customer.player_type);
                setEditParentName(customer.parent_name ?? '');
                setEditLocation((customer.location as Location) ?? null);
                setEditBirthDate(customer.birth_date ?? '');
                setProfileError(null);
                setEditProfile(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.editProfileBtnText}>Bearbeiten</Text>
            </TouchableOpacity>
          </>
        )}
      </SectionCard>

      {/* Qualitätsstufe */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Qualitätsstufe</Text>
        <View style={styles.levelRow}>
          {LEVELS.map(level => {
            const isActive = customer.level === level;
            const color = LEVEL_COLORS[level];
            return (
              <TouchableOpacity
                key={level}
                style={[styles.levelChip, { borderColor: color, backgroundColor: isActive ? color : color + '15' }]}
                onPress={() => doSetLevel(isActive ? null : level)}
                activeOpacity={0.7}
                disabled={levelLoading}
              >
                <Text style={[styles.levelChipText, { color: isActive ? '#fff' : color }]}>
                  {LEVEL_LABELS[level]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!customer.level && <Text style={styles.noLevel}>Keine Qualitätsstufe zugewiesen</Text>}
        {levelError && <Text style={styles.fieldError}>{levelError}</Text>}
      </View>

      {/* Abo / Buchungsberechtigungen */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Abo / Buchungsberechtigungen</Text>
        {PERMISSION_FLAGS.map(({ key, label }) => (
          <View key={key} style={styles.permRow}>
            <Text style={styles.permLabel}>{label}</Text>
            <Switch
              value={!!(customer as any)[key]}
              onValueChange={v => doTogglePermission(key, v)}
              trackColor={{ false: '#E5E7EB', true: '#4A8FE8' }}
              thumbColor="#fff"
            />
          </View>
        ))}

        <View style={styles.exemptBox}>
          <View style={styles.exemptRow}>
            <Text style={styles.exemptLabel}>Alters-/Level-Prüfung ignorieren (Gruppen)</Text>
            <Switch
              value={!!customer.skip_group_age_level_check}
              onValueChange={doToggleGroupExempt}
              trackColor={{ false: '#E5E7EB', true: '#F5A84A' }}
              thumbColor="#fff"
            />
          </View>
          <Text style={styles.exemptHint}>
            Wenn aktiv, kann dieser Spieler vom Admin in jede Gruppe gebucht werden — auch wenn Alter/Level normalerweise nicht passen. Kapazität, Tageslimit und Trainer-Verfügbarkeit bleiben aktiv. Gilt nur für Admin-Buchungen, nicht für die Kundensicht.
          </Text>
        </View>

        {permError && <Text style={styles.fieldError}>{permError}</Text>}

        <Text style={styles.sectionLabel}>Aktive Nachholtermine</Text>
        <View style={styles.tokenDisplayRow}>
          <View style={styles.tokenDisplayItem}>
            <Text style={styles.tokenDisplayCount}>{tokenCounts?.individual ?? 0}</Text>
            <Text style={styles.tokenDisplayLabel}>Einzeltraining</Text>
          </View>
          <View style={styles.tokenDisplayItem}>
            <Text style={styles.tokenDisplayCount}>{tokenCounts?.gruppe ?? 0}</Text>
            <Text style={styles.tokenDisplayLabel}>Gruppentraining</Text>
          </View>
          <View style={styles.tokenDisplayItem}>
            <Text style={styles.tokenDisplayCount}>{confirmedTotal}</Text>
            <Text style={styles.tokenDisplayLabel}>Termine gesamt</Text>
          </View>
        </View>

        {((tokenCounts?.individual ?? 0) + (tokenCounts?.gruppe ?? 0)) > 0 && (
          showTokenReset ? (
            <View style={styles.tokenResetBox}>
              <Text style={styles.tokenResetTitle}>Alle aktiven Stornierungstokens löschen?</Text>
              <Text style={styles.tokenResetSub}>
                Die unbenutzten Nachholtermine von {customer.full_name} werden entfernt und können nicht mehr eingelöst werden.
              </Text>
              {tokenResetError && <Text style={styles.fieldError}>{tokenResetError}</Text>}
              <View style={styles.tokenResetBtns}>
                <TouchableOpacity style={[styles.tokenResetYes, tokenResetLoading && { opacity: 0.6 }]} onPress={doResetTokens} disabled={tokenResetLoading} activeOpacity={0.7}>
                  <Text style={styles.tokenResetYesText}>{tokenResetLoading ? 'Wird zurückgesetzt...' : 'Ja, zurücksetzen'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.tokenResetNo} onPress={() => { setShowTokenReset(false); setTokenResetError(null); }} activeOpacity={0.7}>
                  <Text style={styles.tokenResetNoText}>Abbrechen</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.tokenResetBtn} onPress={() => { setShowTokenReset(true); setTokenResetError(null); }} activeOpacity={0.7}>
              <Text style={styles.tokenResetBtnText}>Tokens zurücksetzen</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* Anwesenheit – Individualtraining */}
      {(() => {
        const indAppts = appointments
          .filter(a =>
            a.status === 'confirmed' &&
            a.date < ts &&
            (a.program === 'individual' || a.program === 'torhueter_individual'),
          )
          .sort((a, b) => b.date.localeCompare(a.date));
        if (indAppts.length === 0) return null;
        const attendedCount = indAppts.filter(a => a.attended === true).length;
        return (
          <SectionCard title="Anwesenheit – Individualtraining">
            <Text style={styles.attendanceCounter}>
              {attendedCount} von {indAppts.length} Terminen wahrgenommen
            </Text>
            {indAppts.map(a => {
              const prog = PROGRAMS.find(p => p.id === a.program);
              return (
                <View key={a.id} style={styles.attendanceRow}>
                  <View style={styles.attendanceInfo}>
                    <Text style={styles.attendanceProg}>{prog?.name ?? a.program}</Text>
                    <Text style={styles.attendanceDate}>{fmtDate(a.date)} · {a.time} Uhr</Text>
                  </View>
                  <View style={styles.attendanceBtns}>
                    <TouchableOpacity
                      style={[styles.attendanceBtn, a.attended === true && styles.attendanceBtnPresent]}
                      onPress={() => onMarkAttended(a.id, a.attended === true ? null : true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.attendanceBtnText, a.attended === true && styles.attendanceBtnTextPresent]}>Ja</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.attendanceBtn, a.attended === false && styles.attendanceBtnAbsent]}
                      onPress={() => onMarkAttended(a.id, a.attended === false ? null : false)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.attendanceBtnText, a.attended === false && styles.attendanceBtnTextAbsent]}>No-Show</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </SectionCard>
        );
      })()}

      {/* Termine */}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF3FB' },
  content: { padding: 32 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  backArrow: { fontSize: 22, color: '#4A8FE8', fontWeight: '600' },
  backLabel: { fontSize: 14, fontWeight: '600', color: '#4A8FE8' },
  pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 28 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 22, fontWeight: '800' },
  customerName: { fontSize: 22, fontWeight: '800', color: '#152238' },
  customerSub: { fontSize: 14, color: '#4A6080', marginTop: 2 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20, marginBottom: 16,
    shadowColor: '#152238', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2,
    borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#152238', marginBottom: 14 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EEF3FB' },
  infoLabel: { fontSize: 13, color: '#4A6080' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#152238', textAlign: 'right', maxWidth: '60%' },
  editSection: { paddingTop: 4 },
  editBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  editInput: {
    backgroundColor: '#F4F8FF', borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#152238', marginBottom: 4, outlineWidth: 0,
  } as any,
  editProfileBtn: { marginTop: 12, backgroundColor: 'rgba(74,143,232,0.08)', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(74,143,232,0.2)' },
  editProfileBtnText: { fontSize: 13, fontWeight: '700', color: '#4A8FE8' },
  cancelEditBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(21,34,56,0.06)' },
  cancelEditText: { fontSize: 14, fontWeight: '600', color: '#4A6080' },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(21,34,56,0.08)', backgroundColor: '#F4F8FF' },
  typeChipActive: { borderColor: '#4A8FE8', backgroundColor: 'rgba(74,143,232,0.08)' },
  typeChipAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  typeChipAvatarText: { fontSize: 12, fontWeight: '800' },
  typeChipText: { fontSize: 13, fontWeight: '700', color: '#4A6080' },
  typeChipTextActive: { color: '#4A8FE8' },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  levelChip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 2 },
  levelChipText: { fontSize: 14, fontWeight: '700' },
  noLevel: { fontSize: 13, color: '#7A90AE', fontStyle: 'italic', marginTop: 4 },
  permRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF3FB' },
  permLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#4A6080', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  exemptBox: { marginTop: 14, backgroundColor: '#FFFBEB', borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A', padding: 14 },
  exemptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  exemptLabel: { flex: 1, fontSize: 14, color: '#92400E', fontWeight: '700' },
  exemptHint: { fontSize: 12, color: '#92400E', lineHeight: 17, marginTop: 8 },
  tokenDisplayRow: { flexDirection: 'row', gap: 10 },
  tokenDisplayItem: { flex: 1, backgroundColor: '#F4F8FF', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)' },
  tokenDisplayCount: { fontSize: 28, fontWeight: '800', color: '#152238' },
  tokenDisplayLabel: { fontSize: 11, fontWeight: '600', color: '#7A90AE', marginTop: 4, textAlign: 'center' },
  tokenResetBtn: { marginTop: 14, alignSelf: 'flex-start', backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  tokenResetBtnText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  tokenResetBox: { marginTop: 14, backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FECACA', borderRadius: 12, padding: 16 },
  tokenResetTitle: { fontSize: 14, fontWeight: '800', color: '#991B1B', marginBottom: 6 },
  tokenResetSub: { fontSize: 13, color: '#7F1D1D', lineHeight: 19, marginBottom: 14 },
  tokenResetBtns: { flexDirection: 'row', gap: 10 },
  tokenResetYes: { flex: 1, backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  tokenResetYesText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  tokenResetNo: { flex: 1, backgroundColor: 'rgba(21,34,56,0.06)', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  tokenResetNoText: { fontSize: 14, fontWeight: '600', color: '#4A6080' },
  activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EEF3FB', marginBottom: 4 },
  activeRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  activeLabel: { fontSize: 13, fontWeight: '700', color: '#152238' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#4A6080', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  formSection: { backgroundColor: '#F4F8FF', borderRadius: 10, padding: 16, marginBottom: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#152238', outlineWidth: 0 } as any,
  saveBtn: {
    backgroundColor: '#152238', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 16,
    shadowColor: '#152238', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  addBtn: { backgroundColor: 'rgba(74,143,232,0.08)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(74,143,232,0.2)' },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#4A8FE8' },
  programRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  programChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(21,34,56,0.08)', backgroundColor: '#fff' },
  programChipActive: { borderColor: '#4A8FE8', backgroundColor: 'rgba(74,143,232,0.1)' },
  programChipText: { fontSize: 13, color: '#4A6080', fontWeight: '600' },
  programChipTextActive: { color: '#4A8FE8' },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  slotChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(21,34,56,0.08)', backgroundColor: '#fff' },
  slotChipActive: { borderColor: '#4A8FE8', backgroundColor: 'rgba(74,143,232,0.1)' },
  slotChipText: { fontSize: 13, color: '#4A6080', fontWeight: '600' },
  slotChipTextActive: { color: '#4A8FE8' },
  slotChipDisabled: { borderColor: 'rgba(21,34,56,0.06)', backgroundColor: '#F4F8FF', opacity: 0.5 },
  slotChipTextDisabled: { color: '#7A90AE' },
  fieldError: { fontSize: 13, color: '#EF4444', fontWeight: '600', marginTop: 10 },
  recurToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 4 },
  recurBox: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)', padding: 12, marginBottom: 4 },
  recurPreview: { fontSize: 13, color: '#4A6080', marginTop: 10, lineHeight: 18 },
  recurConflictBox: { backgroundColor: '#FEF2F2', borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', padding: 14, marginBottom: 16 },
  recurConflictTitle: { fontSize: 13, fontWeight: '700', color: '#B91C1C', marginBottom: 8 },
  recurConflictItem: { fontSize: 13, color: '#7F1D1D', lineHeight: 19 },
  recurSuccessBox: { backgroundColor: '#ECFDF5', borderRadius: 10, borderWidth: 1, borderColor: '#A7F3D0', padding: 14, marginBottom: 16 },
  recurSuccessText: { fontSize: 14, fontWeight: '600', color: '#047857' },
  apptSection: { fontSize: 12, fontWeight: '700', color: '#7A90AE', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  emptyAppt: { textAlign: 'center', color: '#7A90AE', fontSize: 14, paddingVertical: 20 },
  apptRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF3FB' },
  apptColorBar: { width: 3, height: 36, borderRadius: 2 },
  apptInfo: { flex: 1 },
  apptProg: { fontSize: 14, fontWeight: '700' },
  apptDate: { fontSize: 12, color: '#4A6080', marginTop: 2 },
  cancelledBadge: { backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  cancelledText: { fontSize: 11, fontWeight: '700', color: '#EF4444' },
  stornBtn: { backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  stornText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },
  deleteHeaderBtn: { backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  deleteHeaderBtnText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  deleteConfirmBox: { backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FECACA', borderRadius: 14, padding: 20, marginBottom: 16 },
  deleteConfirmTitle: { fontSize: 16, fontWeight: '800', color: '#991B1B', marginBottom: 8 },
  deleteConfirmSub: { fontSize: 14, color: '#7F1D1D', lineHeight: 20, marginBottom: 16 },
  deleteError: { fontSize: 13, color: '#DC2626', fontWeight: '600', marginBottom: 12 },
  deleteConfirmBtns: { flexDirection: 'row', gap: 10 },
  deleteConfirmYes: { flex: 1, backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  deleteConfirmYesText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  deleteConfirmNo: { flex: 1, backgroundColor: 'rgba(21,34,56,0.06)', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  deleteConfirmNoText: { fontSize: 14, fontWeight: '600', color: '#4A6080' },
  birthYearWarning: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  birthYearWarningText: { fontSize: 13, color: '#92400E' },
  attendanceCounter: { fontSize: 13, fontWeight: '700', color: '#4A8FE8', marginBottom: 12, backgroundColor: 'rgba(74,143,232,0.08)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  attendanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF3FB' },
  attendanceInfo: { flex: 1 },
  attendanceProg: { fontSize: 13, fontWeight: '700', color: '#374151' },
  attendanceDate: { fontSize: 12, color: '#4A6080', marginTop: 2 },
  attendanceBtns: { flexDirection: 'row', gap: 8 },
  attendanceBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(21,34,56,0.08)', backgroundColor: '#F4F8FF' },
  attendanceBtnPresent: { borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.1)' },
  attendanceBtnAbsent: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)' },
  attendanceBtnText: { fontSize: 12, fontWeight: '700', color: '#7A90AE' },
  attendanceBtnTextPresent: { color: '#16A34A' },
  attendanceBtnTextAbsent: { color: '#EF4444' },
});
