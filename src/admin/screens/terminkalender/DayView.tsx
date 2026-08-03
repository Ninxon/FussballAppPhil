import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { CustomerProfile, AdminAppointment, TrainerProfile, MutationResult } from '../../hooks/useAdminData';
import { PROGRAMS, PROGRAM_COLORS } from '../../../constants/programs';
import { isBookableDay, BlockedPeriod } from '../../../utils/bookingRules';
import { C, PROGRAM_BG, ALL_SLOTS, TIME_COL_W } from './theme';
import { s, dg } from './styles';
import { AppointmentIndex } from './useAppointmentIndex';
import { CancelReasonSection } from './CancelReasonSection';
import { BookingPanel } from './BookingPanel';

interface Props {
  dayDate: string;
  todayStr: string;
  customers: CustomerProfile[];
  trainers: TrainerProfile[];
  apptIndex: AppointmentIndex;
  blockedPeriods: BlockedPeriod[];
  /** Verfügbare Breite für das Raster (Fenster minus Sidebar/Padding). */
  availWidth: number;
  selectedApptId: string | null;
  onSelectAppt: (id: string | null) => void;
  cancelLoading: boolean;
  cancelError: string | null;
  onCancelAppt: (id: string, reason?: string) => void;
  bookingOpen: boolean;
  onToggleBooking: () => void;
  onCloseBooking: () => void;
  onAddAppointment: (userId: string, date: string, time: string, program: string, trainerId?: string | null) => Promise<MutationResult>;
}

// Tagesansicht: eine Spalte je Trainer, Zeilen sind die Slots.
export function DayView({
  dayDate, todayStr, customers, trainers, apptIndex, blockedPeriods, availWidth,
  selectedApptId, onSelectAppt, cancelLoading, cancelError, onCancelAppt,
  bookingOpen, onToggleBooking, onCloseBooking, onAddAppointment,
}: Props) {
  const dayAppts = [...apptIndex.confirmedByDateTime.entries()]
    .filter(([key]) => key.startsWith(`${dayDate}|`))
    .flatMap(([, appts]) => appts)
    .sort((a, b) => a.time.localeCompare(b.time));

  const dayCancels = apptIndex.shortCancelsByDate.get(dayDate) ?? [];

  const isPast = dayDate < todayStr;
  const canBook = !isPast && isBookableDay(dayDate, blockedPeriods);

  const cols = trainers;
  const numCols = cols.length || 1;
  const colW = Math.max(150, Math.floor((availWidth - TIME_COL_W) / numCols));

  const selAppt = selectedApptId ? dayAppts.find(a => a.id === selectedApptId) : null;
  const selCust = selAppt ? customers.find(c => c.id === selAppt.player_id) : null;
  const selProg = selAppt ? PROGRAMS.find(p => p.id === selAppt.program) : null;
  const selTrainer = selAppt?.trainer_id ? trainers.find(t => t.id === selAppt.trainer_id) : null;
  const selColor = selAppt ? (PROGRAM_COLORS[selAppt.program] ?? C.accent) : C.accent;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
      <View style={s.dayTopBar}>
        {dayDate === todayStr && (
          <View style={s.todayBadge}><Text style={s.todayBadgeText}>Heute</Text></View>
        )}
        {canBook && (
          <TouchableOpacity style={s.addBtn} onPress={onToggleBooking} activeOpacity={0.7}>
            <Text style={s.addBtnText}>{bookingOpen ? '✕ Abbrechen' : '+ Termin buchen'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {bookingOpen && (
        <BookingPanel
          day={dayDate}
          customers={customers}
          trainers={trainers}
          onClose={onCloseBooking}
          onAddAppointment={onAddAppointment}
        />
      )}

      {dayAppts.length === 0 && dayCancels.length === 0 && !bookingOpen && (
        <View style={s.emptyState}>
          <Text style={s.emptyText}>Keine bestätigten Termine</Text>
        </View>
      )}

      {(dayAppts.length > 0 || dayCancels.length > 0) && (
        <View style={s.gridCard}>
          <ScrollView horizontal={colW === 150} showsHorizontalScrollIndicator>
            <View>
              {/* Trainer header row */}
              <View style={[dg.row, dg.headRow]}>
                <View style={[dg.timeCell, { width: TIME_COL_W }]}>
                  <Text style={dg.headLabel}>Zeit</Text>
                </View>
                {cols.map(t => (
                  <View key={t.id} style={[dg.trainerCell, { width: colW }]}>
                    <Text style={dg.trainerName} numberOfLines={1}>{t.full_name}</Text>
                    {t.trainer_specialty && (
                      <View style={[dg.specialtyPill, {
                        backgroundColor: t.trainer_specialty === 'torwart' ? '#9B59B6' : '#4A8FE8'
                      }]}>
                        <Text style={dg.specialtyText}>
                          {t.trainer_specialty === 'torwart' ? 'Torwart' : 'Spieler'}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>

              {/* Slot rows */}
              {ALL_SLOTS.map((slot, i) => (
                <View key={slot} style={[dg.row, i % 2 === 1 && dg.rowAlt]}>
                  <View style={[dg.timeCell, { width: TIME_COL_W }]}>
                    <Text style={dg.timeText}>{slot}</Text>
                  </View>
                  {cols.map(t => {
                    const cellAppts = dayAppts.filter(a => a.trainer_id === t.id && a.time === slot);
                    const cellCancels = dayCancels.filter(a => a.trainer_id === t.id && a.time === slot);
                    return (
                      <View key={t.id} style={[dg.cell, { width: colW }]}>
                        {cellAppts.map(a => {
                          const cust = customers.find(c => c.id === a.player_id);
                          const color = PROGRAM_COLORS[a.program] ?? C.accent;
                          const bg = PROGRAM_BG[a.program] ?? C.accentLight;
                          const isSel = selectedApptId === a.id;
                          return (
                            <TouchableOpacity
                              key={a.id}
                              style={[dg.apptTag, { borderLeftColor: color },
                                isSel ? { backgroundColor: color } : { backgroundColor: bg }]}
                              onPress={() => onSelectAppt(isSel ? null : a.id)}
                              activeOpacity={0.85}
                            >
                              <Text style={[dg.apptTagText, { color: isSel ? '#fff' : color }]} numberOfLines={1}>
                                {cust?.full_name ?? '—'}
                              </Text>
                              {a.is_makeup && (
                                <View style={dg.ntPill}>
                                  <Text style={dg.ntPillText}>NT</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                        {cellCancels.map(a => {
                          const cust = customers.find(c => c.id === a.player_id);
                          return (
                            <View key={a.id} style={dg.cancelTag}>
                              <Text style={dg.cancelTagLabel} numberOfLines={1}>⚠ Kurzfristig storniert</Text>
                              <Text style={dg.cancelTagName} numberOfLines={1}>{cust?.full_name ?? '—'}</Text>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Detail panel for selected appointment */}
          {selAppt && (
            <View style={s.detailPanel}>
              <View style={[s.detailAccent, { backgroundColor: selColor }]} />
              <View style={s.detailBody}>
                <Text style={s.detailProgram}>{selProg?.name}</Text>
                <Text style={s.detailName}>{selCust?.full_name ?? '—'}</Text>
                <Text style={s.detailMeta}>
                  {selAppt.time} Uhr{selTrainer ? ` · ${selTrainer.full_name}` : ''}
                </Text>
                <CancelReasonSection placeholder="Grund (optional) – wird dem Kunden per E-Mail mitgeteilt">
                  {reason => (
                    <>
                      {cancelError && <Text style={s.errorText}>{cancelError}</Text>}
                      <TouchableOpacity
                        style={[s.stornBtn, cancelLoading && { opacity: 0.6 }]}
                        onPress={() => onCancelAppt(selAppt.id, reason)}
                        activeOpacity={0.7}
                        disabled={cancelLoading}
                      >
                        <Text style={s.stornBtnText}>{cancelLoading ? 'Stornieren…' : 'Termin stornieren'}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </CancelReasonSection>
              </View>
              <TouchableOpacity onPress={() => onSelectAppt(null)} style={s.detailClose}>
                <Text style={s.detailCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
