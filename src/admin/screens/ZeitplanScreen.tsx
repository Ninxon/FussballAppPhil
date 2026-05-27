import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { TrainerSchedule, TrainerSpecialty } from '../../types';
import { TrainerProfile } from '../hooks/useAdminData';
import { SLOTS } from '../../constants/slots';
import { LOCATIONS, Location } from '../../constants/studio';

const LOC_SHORT: Record<Location, string> = { 'Rüsselsheim': 'R', 'Kelsterbach': 'K' };
const LOC_COLOR: Record<Location, string> = { 'Rüsselsheim': '#4A8FE8', 'Kelsterbach': '#5A8C6A' };

// Zyklus pro Zelle: Aus → Rüsselsheim → Kelsterbach → Aus.
// "Aus" bedeutet keine Slot-Zeile; jeder vorhandene Slot hat einen Standort.
function nextLocation(current: Location | null | undefined, hasRow: boolean): Location | null {
  if (!hasRow || current == null) return LOCATIONS[0];
  const idx = LOCATIONS.indexOf(current);
  return idx < LOCATIONS.length - 1 ? LOCATIONS[idx + 1] : null;
}

const DAYS: { label: string; value: number }[] = [
  { label: 'Mo', value: 1 },
  { label: 'Di', value: 2 },
  { label: 'Mi', value: 3 },
  { label: 'Do', value: 4 },
  { label: 'Fr', value: 5 },
];

const SPECIALTY_LABEL: Record<TrainerSpecialty, string> = {
  spieler: 'Spieler',
  torwart: 'Torwart',
};

const SPECIALTY_COLOR: Record<TrainerSpecialty, string> = {
  spieler: '#4A8FE8',
  torwart: '#9B59B6',
};

interface Props {
  trainers: TrainerProfile[];
  trainerSchedules: TrainerSchedule[];
  onSetSlot: (trainerId: string, day: number, time: string, location: Location | null) => Promise<{ error: unknown }>;
  onCreateTrainer: (params: { full_name: string; email: string; specialty: TrainerSpecialty }) => Promise<{ error: string | null; tempPassword?: string }>;
  onUpdateTrainer: (trainerId: string, params: { full_name: string; trainer_specialty: TrainerSpecialty }) => Promise<{ error: string | null }>;
  onDeleteTrainer: (trainerId: string) => Promise<{ error: string | null; cancelledCount?: number }>;
}

export function ZeitplanScreen({ trainers, trainerSchedules, onSetSlot, onCreateTrainer, onUpdateTrainer, onDeleteTrainer }: Props) {
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(
    trainers.length > 0 ? trainers[0].id : null,
  );
  const [toggling, setToggling] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);

  // Anlegen
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formSpecialty, setFormSpecialty] = useState<TrainerSpecialty>('spieler');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Bearbeiten
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSpecialty, setEditSpecialty] = useState<TrainerSpecialty>('spieler');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Löschen
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const selectedTrainer = trainers.find(t => t.id === selectedTrainerId) ?? null;

  const slotRow = (day: number, time: string) =>
    trainerSchedules.find(
      s => s.trainer_id === selectedTrainerId && s.day_of_week === day && s.time === time,
    );

  const handleCycle = async (day: number, time: string) => {
    if (!selectedTrainerId) return;
    const row = slotRow(day, time);
    const next = nextLocation(row?.location ?? null, !!row);
    const key = `${day}-${time}`;
    setToggling(key);
    setSlotError(null);
    const { error } = await onSetSlot(selectedTrainerId, day, time, next);
    setToggling(null);
    if (error) {
      const msg = (error as { message?: string })?.message ?? String(error);
      // PostgREST hängt teils Tabellen-Präfixe oder SQL-Codes an — wir zeigen
      // die reine Trigger-Botschaft, wenn wir sie isolieren können.
      setSlotError(msg.replace(/^.*?:\s*/, ''));
    }
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formEmail.trim()) {
      setFormError('Name und E-Mail sind Pflicht.');
      return;
    }
    setFormLoading(true);
    setFormError(null);
    setFormSuccess(null);
    const { error, tempPassword } = await onCreateTrainer({
      full_name: formName.trim(),
      email: formEmail.trim(),
      specialty: formSpecialty,
    });
    setFormLoading(false);
    if (error) {
      setFormError(error);
    } else {
      setFormSuccess(`Trainer angelegt. Temporäres Passwort: ${tempPassword}`);
      setFormName('');
      setFormEmail('');
      setFormSpecialty('spieler');
      setShowForm(false);
    }
  };

  const openEdit = () => {
    if (!selectedTrainer) return;
    setEditName(selectedTrainer.full_name);
    setEditSpecialty(selectedTrainer.trainer_specialty ?? 'spieler');
    setEditError(null);
    setShowEdit(true);
    setShowDeleteConfirm(false);
  };

  const handleUpdate = async () => {
    if (!selectedTrainerId || !editName.trim()) {
      setEditError('Name darf nicht leer sein.');
      return;
    }
    setEditLoading(true);
    setEditError(null);
    const { error } = await onUpdateTrainer(selectedTrainerId, {
      full_name: editName.trim(),
      trainer_specialty: editSpecialty,
    });
    setEditLoading(false);
    if (error) {
      setEditError(error);
    } else {
      setShowEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTrainerId) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const { error, cancelledCount } = await onDeleteTrainer(selectedTrainerId);
    setDeleteLoading(false);
    if (error) {
      setDeleteError(error);
    } else {
      setShowDeleteConfirm(false);
      setSelectedTrainerId(trainers.filter(t => t.id !== selectedTrainerId)[0]?.id ?? null);
      setDeleteSuccess(
        cancelledCount && cancelledCount > 0
          ? `Trainer gelöscht. ${cancelledCount} Termin${cancelledCount > 1 ? 'e' : ''} storniert, Nachholtermine ausgestellt.`
          : 'Trainer erfolgreich gelöscht.',
      );
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Trainerzeitplan</Text>

      {/* Trainer-Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {trainers.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.chip, selectedTrainerId === t.id && styles.chipActive]}
            onPress={() => {
              setSelectedTrainerId(t.id);
              setShowEdit(false);
              setShowDeleteConfirm(false);
              setDeleteError(null);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipName, selectedTrainerId === t.id && styles.chipNameActive]}>
              {t.full_name}
            </Text>
            {t.trainer_specialty && (
              <View style={[styles.specialtyBadge, { backgroundColor: SPECIALTY_COLOR[t.trainer_specialty] }]}>
                <Text style={styles.specialtyBadgeText}>{SPECIALTY_LABEL[t.trainer_specialty]}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.chip, styles.chipAdd]}
          onPress={() => { setShowForm(v => !v); setFormError(null); setFormSuccess(null); setShowEdit(false); setShowDeleteConfirm(false); }}
          activeOpacity={0.7}
        >
          <Text style={styles.chipAddText}>+ Trainer anlegen</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Trainer-Aktionen (Bearbeiten / Löschen) */}
      {selectedTrainer && !showForm && (
        <View style={styles.trainerActions}>
          <TouchableOpacity
            style={[styles.actionBtn, showEdit && styles.actionBtnActive]}
            onPress={() => { showEdit ? setShowEdit(false) : openEdit(); setShowDeleteConfirm(false); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionBtnText, showEdit && styles.actionBtnTextActive]}>✎ Bearbeiten</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger, showDeleteConfirm && styles.actionBtnDangerActive]}
            onPress={() => { setShowDeleteConfirm(v => !v); setShowEdit(false); setDeleteError(null); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>✕ Löschen</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Edit-Formular */}
      {showEdit && selectedTrainer && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Trainer bearbeiten</Text>
          <TextInput
            style={styles.input}
            placeholder="Name"
            value={editName}
            onChangeText={setEditName}
            placeholderTextColor="#999"
          />
          <View style={styles.specialtyRow}>
            {(['spieler', 'torwart'] as TrainerSpecialty[]).map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.specialtyBtn, editSpecialty === s && { backgroundColor: SPECIALTY_COLOR[s] }]}
                onPress={() => setEditSpecialty(s)}
                activeOpacity={0.7}
              >
                <Text style={[styles.specialtyBtnText, editSpecialty === s && styles.specialtyBtnTextActive]}>
                  {SPECIALTY_LABEL[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {editError && <Text style={styles.errorText}>{editError}</Text>}
          {editLoading
            ? <ActivityIndicator style={{ marginTop: 8 }} color="#5A8C6A" />
            : (
              <View style={styles.specialtyRow}>
                <TouchableOpacity style={[styles.submitBtn, { flex: 1 }]} onPress={handleUpdate} activeOpacity={0.8}>
                  <Text style={styles.submitBtnText}>Speichern</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowEdit(false)} activeOpacity={0.7}>
                  <Text style={styles.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
              </View>
            )
          }
        </View>
      )}

      {/* Lösch-Bestätigung */}
      {showDeleteConfirm && selectedTrainer && (
        <View style={styles.deleteConfirm}>
          <Text style={styles.deleteConfirmTitle}>Trainer löschen?</Text>
          <Text style={styles.deleteConfirmText}>
            Alle bestätigten Termine von <Text style={{ fontWeight: '800' }}>{selectedTrainer.full_name}</Text> werden storniert und die betroffenen Kunden erhalten automatisch einen Nachholtermin.
          </Text>
          {deleteError && <Text style={styles.errorText}>{deleteError}</Text>}
          {deleteLoading
            ? <ActivityIndicator style={{ marginTop: 8 }} color="#EF4444" />
            : (
              <View style={styles.specialtyRow}>
                <TouchableOpacity style={[styles.deleteBtn, { flex: 1 }]} onPress={handleDelete} activeOpacity={0.8}>
                  <Text style={styles.deleteBtnText}>Ja, löschen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowDeleteConfirm(false)} activeOpacity={0.7}>
                  <Text style={styles.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
              </View>
            )
          }
        </View>
      )}

      {/* Anlegen-Formular */}
      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Neuen Trainer anlegen</Text>
          <TextInput
            style={styles.input}
            placeholder="Name"
            value={formName}
            onChangeText={setFormName}
            placeholderTextColor="#999"
          />
          <TextInput
            style={styles.input}
            placeholder="E-Mail"
            value={formEmail}
            onChangeText={setFormEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#999"
          />
          <View style={styles.specialtyRow}>
            {(['spieler', 'torwart'] as TrainerSpecialty[]).map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.specialtyBtn, formSpecialty === s && { backgroundColor: SPECIALTY_COLOR[s] }]}
                onPress={() => setFormSpecialty(s)}
                activeOpacity={0.7}
              >
                <Text style={[styles.specialtyBtnText, formSpecialty === s && styles.specialtyBtnTextActive]}>
                  {SPECIALTY_LABEL[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {formError && <Text style={styles.errorText}>{formError}</Text>}
          {formLoading
            ? <ActivityIndicator style={{ marginTop: 8 }} color="#5A8C6A" />
            : (
              <TouchableOpacity style={styles.submitBtn} onPress={handleCreate} activeOpacity={0.8}>
                <Text style={styles.submitBtnText}>Anlegen</Text>
              </TouchableOpacity>
            )
          }
        </View>
      )}

      {formSuccess && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{formSuccess}</Text>
        </View>
      )}

      {deleteSuccess && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{deleteSuccess}</Text>
        </View>
      )}

      {slotError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorBoxText}>{slotError}</Text>
          <TouchableOpacity onPress={() => setSlotError(null)} activeOpacity={0.7}>
            <Text style={styles.errorBoxDismiss}>Schließen</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Wochenraster */}
      {selectedTrainer && (
        <View style={styles.legend}>
          <Text style={styles.legendHint}>Tippen wechselt: Aus → Rüsselsheim → Kelsterbach → Aus</Text>
          <View style={styles.legendRow}>
            {LOCATIONS.map(loc => (
              <View key={loc} style={styles.legendItem}>
                <Text style={[styles.legendDot, { color: LOC_COLOR[loc] }]}>{LOC_SHORT[loc]}</Text>
                <Text style={styles.legendLabel}>{loc}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {selectedTrainer ? (
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <View style={styles.timeCell} />
            {DAYS.map(d => (
              <View key={d.value} style={styles.dayHeader}>
                <Text style={styles.dayHeaderText}>{d.label}</Text>
              </View>
            ))}
          </View>

          {SLOTS.map(time => (
            <View key={time} style={styles.gridRow}>
              <View style={styles.timeCell}>
                <Text style={styles.timeCellText}>{time}</Text>
              </View>
              {DAYS.map(d => {
                const row = slotRow(d.value, time);
                const loc = row?.location ?? null;
                const key = `${d.value}-${time}`;
                const loading = toggling === key;
                const label = loc ? LOC_SHORT[loc] : '○';
                const color = loc ? LOC_COLOR[loc] : '#D1D5DB';
                return (
                  <TouchableOpacity
                    key={d.value}
                    style={[styles.cell, row ? styles.cellActive : styles.cellInactive]}
                    onPress={() => handleCycle(d.value, time)}
                    activeOpacity={0.7}
                  >
                    {loading
                      ? <ActivityIndicator size="small" color={color} />
                      : <Text style={[styles.cellDot, { color, fontWeight: loc ? '800' : '400' }]}>
                          {label}
                        </Text>
                    }
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>Noch keine Trainer vorhanden.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF3FB' },
  content: { padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#152238', marginBottom: 16 },

  chipRow: { flexDirection: 'row', marginBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(21,34,56,0.08)', marginRight: 8 },
  chipActive: { borderColor: '#5A8C6A', backgroundColor: '#F0F7F2' },
  chipName: { fontSize: 13, fontWeight: '600', color: '#4A6080' },
  chipNameActive: { color: '#5A8C6A' },
  specialtyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  specialtyBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  chipAdd: { borderStyle: 'dashed', borderColor: '#5A8C6A' },
  chipAddText: { fontSize: 13, fontWeight: '600', color: '#5A8C6A' },

  trainerActions: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(21,34,56,0.08)', backgroundColor: '#fff' },
  actionBtnActive: { borderColor: '#5A8C6A', backgroundColor: '#F0F7F2' },
  actionBtnDanger: { borderColor: '#FECACA' },
  actionBtnDangerActive: { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: '#4A6080' },
  actionBtnTextActive: { color: '#5A8C6A' },
  actionBtnDangerText: { color: '#EF4444' },

  form: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)' },
  formTitle: { fontSize: 15, fontWeight: '700', color: '#152238', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#152238', marginBottom: 10, backgroundColor: '#F4F8FF' },
  specialtyRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  specialtyBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(21,34,56,0.08)', alignItems: 'center' },
  specialtyBtnText: { fontSize: 13, fontWeight: '600', color: '#4A6080' },
  specialtyBtnTextActive: { color: '#fff' },
  errorText: { color: '#DC2626', fontSize: 13, marginBottom: 8 },
  submitBtn: {
    backgroundColor: '#152238', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 4,
    shadowColor: '#152238', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn: { backgroundColor: 'rgba(21,34,56,0.06)', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  cancelBtnText: { color: '#4A6080', fontWeight: '600', fontSize: 14 },

  deleteConfirm: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  deleteConfirmTitle: { fontSize: 15, fontWeight: '700', color: '#991B1B', marginBottom: 8 },
  deleteConfirmText: { fontSize: 14, color: '#374151', lineHeight: 20, marginBottom: 12 },
  deleteBtn: { backgroundColor: '#EF4444', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  successBox: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC', borderRadius: 8, padding: 12, marginBottom: 16 },
  successText: { color: '#15803D', fontSize: 13, fontWeight: '600' },

  errorBox: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 8, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  errorBoxText: { color: '#991B1B', fontSize: 13, fontWeight: '600', flex: 1 },
  errorBoxDismiss: { color: '#991B1B', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },

  legend: { marginBottom: 10 },
  legendHint: { fontSize: 12, color: '#4A6080', marginBottom: 6 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { fontSize: 14, fontWeight: '800' },
  legendLabel: { fontSize: 12, color: '#4A6080' },

  grid: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)' },
  gridRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EEF3FB' },
  timeCell: { width: 60, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, backgroundColor: '#F4F8FF' },
  timeCellText: { fontSize: 12, fontWeight: '600', color: '#4A6080' },
  dayHeader: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, backgroundColor: '#F4F8FF' },
  dayHeaderText: { fontSize: 13, fontWeight: '700', color: '#152238' },
  cell: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 12 },
  cellActive: { backgroundColor: '#F0F7F2' },
  cellInactive: { backgroundColor: '#fff' },
  cellDot: { fontSize: 18 },
  cellDotActive: { color: '#5A8C6A' },
  cellDotInactive: { color: '#D1D5DB' },

  emptyText: { color: '#7A90AE', fontSize: 14, marginTop: 24, textAlign: 'center' },
});
