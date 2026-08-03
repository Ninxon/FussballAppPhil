import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { CustomerProfile, AdminAppointment, TrainerProfile, MutationResult } from '../../hooks/useAdminData';
import { PROGRAMS, PROGRAM_CATEGORY, PROGRAM_COLORS, ProgramId } from '../../../constants/programs';
import { isBookableDay, BlockedPeriod } from '../../../utils/bookingRules';
import { C, PROGRAM_BG, DE_DAYS, ALL_SLOTS, TIME_COL_W } from './theme';
import { s, wg } from './styles';
import { dateStr } from './helpers';
import { AppointmentIndex } from './useAppointmentIndex';
import { CancelReasonSection } from './CancelReasonSection';
import { BookingPanel } from './BookingPanel';

interface Props {
  days: Date[];
  todayStr: string;
  customers: CustomerProfile[];
  trainers: TrainerProfile[];
  apptIndex: AppointmentIndex;
  allAppointments: AdminAppointment[];
  blockedPeriods: BlockedPeriod[];
  gridWidth: number;
  dayColW: number;
  expandedGroupKey: string | null;
  onExpandGroup: (key: string | null) => void;
  cancelLoading: boolean;
  cancelError: string | null;
  onCancelAppt: (id: string, reason?: string) => void;
  onSwitchToDay: (ds: string) => void;
  bookingDay: string | null;
  onToggleBookingDay: (ds: string) => void;
  onCloseBooking: () => void;
  onAddAppointment: (userId: string, date: string, time: string, program: string, trainerId?: string | null) => Promise<MutationResult>;
}

// Wochenansicht: sieben Tagesspalten, Zeilen sind die Slots. Gruppentermine
// werden je Programm+Trainer zu einem Block zusammengefasst.
export function WeekView({
  days, todayStr, customers, trainers, apptIndex, allAppointments, blockedPeriods,
  gridWidth, dayColW, expandedGroupKey, onExpandGroup, cancelLoading, cancelError,
  onCancelAppt, onSwitchToDay, bookingDay, onToggleBookingDay, onCloseBooking, onAddAppointment,
}: Props) {
  // Einzeltermine nutzen die UUID als Schlüssel, Gruppen den zusammengesetzten.
  const expandedDetail = expandedGroupKey ? (() => {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(expandedGroupKey);
    if (isUUID) {
      const appt = allAppointments.find(a => a.id === expandedGroupKey && a.status === 'confirmed');
      return appt ? [appt] : null;
    }
    const [expDate, expTime, expProg, expTrainerId] = expandedGroupKey.split('|');
    const appts = (apptIndex.confirmedByDateTime.get(`${expDate}|${expTime}`) ?? []).filter(a =>
      a.program === expProg && (a.trainer_id ?? '') === expTrainerId
    );
    return appts.length ? appts : null;
  })() : null;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
      {/* ── Calendar grid card ── */}
      <View style={s.gridCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ minWidth: gridWidth }}>

            {/* ── Day header row ── */}
            <View style={wg.headRow}>
              <View style={{ width: TIME_COL_W }} />
              {days.map((day, i) => {
                const ds = dateStr(day);
                const isToday = ds === todayStr;
                const isPast = ds < todayStr;
                const isWeekend = i >= 5;
                const canBook = !isPast && isBookableDay(ds, blockedPeriods);
                const count = apptIndex.confirmedCountByDate.get(ds) ?? 0;
                const cancelCount = (apptIndex.shortCancelsByDate.get(ds) ?? []).length;

                return (
                  <TouchableOpacity
                    key={ds}
                    style={[
                      wg.dayHead, { width: dayColW },
                      isToday && wg.dayHeadToday,
                      isWeekend && !isToday && wg.dayHeadWeekend,
                    ]}
                    onPress={() => onSwitchToDay(ds)}
                    activeOpacity={0.75}
                  >
                    <Text style={[wg.dayName, isToday && wg.dayNameToday, isPast && !isToday && wg.faded]}>
                      {DE_DAYS[i]}
                    </Text>
                    <Text style={[wg.dayNum, isToday && wg.dayNumToday, isPast && !isToday && wg.faded]}>
                      {day.getDate()}
                    </Text>
                    {count > 0 && (
                      <View style={[wg.countBadge, isToday && wg.countBadgeToday]}>
                        <Text style={[wg.countText, isToday && wg.countTextToday]}>{count}</Text>
                      </View>
                    )}
                    {cancelCount > 0 && (
                      <View style={wg.cancelBadge}>
                        <Text style={wg.cancelBadgeText}>⚠ {cancelCount} kurzfristig</Text>
                      </View>
                    )}
                    {canBook && (
                      <TouchableOpacity
                        style={[wg.addBtn, isToday && wg.addBtnToday]}
                        onPress={(e) => { e.stopPropagation?.(); onToggleBookingDay(ds); }}
                        activeOpacity={0.7}
                      >
                        <Text style={[wg.addBtnText, isToday && wg.addBtnTextToday]}>
                          {bookingDay === ds ? '✕' : '+'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Slot rows ── */}
            {ALL_SLOTS.map((slot, slotIdx) => (
              <View key={slot} style={[wg.slotRow, slotIdx % 2 === 1 && wg.slotRowAlt]}>
                <View style={[wg.timeCell, { width: TIME_COL_W }]}>
                  <Text style={wg.timeText}>{slot}</Text>
                </View>

                {days.map((day, i) => {
                  const ds = dateStr(day);
                  const isToday = ds === todayStr;
                  const isPast = ds < todayStr;
                  const isWeekend = i >= 5;
                  const slotAppts = apptIndex.confirmedByDateTime.get(`${ds}|${slot}`) ?? [];
                  const slotCancels = apptIndex.shortCancelsByDateTime.get(`${ds}|${slot}`) ?? [];

                  // Group by program+trainer for groups; individual appointments each get their own block
                  const grouped = new Map<string, AdminAppointment[]>();
                  slotAppts.forEach(a => {
                    const isGrpAppt = PROGRAM_CATEGORY[a.program as ProgramId] === 'gruppe';
                    const key = isGrpAppt
                      ? `${ds}|${a.time}|${a.program}|${a.trainer_id ?? ''}`
                      : a.id;
                    if (!grouped.has(key)) grouped.set(key, []);
                    grouped.get(key)!.push(a);
                  });

                  return (
                    <View
                      key={ds}
                      style={[
                        wg.cell, { width: dayColW },
                        isToday && wg.cellToday,
                        isWeekend && wg.cellWeekend,
                        isPast && !isToday && wg.cellPast,
                      ]}
                    >
                      {Array.from(grouped.entries()).map(([key, appts]) => {
                        const first = appts[0];
                        const color = PROGRAM_COLORS[first.program] ?? C.accent;
                        const bg = PROGRAM_BG[first.program] ?? C.accentLight;
                        const prog = PROGRAMS.find(p => p.id === first.program);
                        const trainer = first.trainer_id ? trainers.find(t => t.id === first.trainer_id) : null;
                        const isGrp = PROGRAM_CATEGORY[first.program as ProgramId] === 'gruppe';
                        const cap = isGrp ? 4 : 1;
                        const isSel = expandedGroupKey === key;

                        return (
                          <TouchableOpacity
                            key={key}
                            style={[
                              wg.apptBlock,
                              { borderLeftColor: color },
                              isSel ? { backgroundColor: color } : { backgroundColor: bg },
                            ]}
                            onPress={() => onExpandGroup(isSel ? null : key)}
                            activeOpacity={0.8}
                          >
                            <View style={wg.apptBlockTop}>
                              <Text style={[wg.apptProg, { color: isSel ? '#fff' : color }]} numberOfLines={1}>
                                {prog?.name ?? first.program}
                              </Text>
                              {appts.some(a => a.is_makeup) && (
                                <View style={wg.ntPill}>
                                  <Text style={wg.ntPillText}>NT</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[wg.apptMeta, isSel && wg.apptMetaSel]} numberOfLines={1}>
                              {isGrp
                                ? `${appts.length}/${cap} Teiln.`
                                : (customers.find(c => c.id === first.player_id)?.full_name ?? '—')}
                            </Text>
                            {trainer && (
                              <Text style={[wg.apptTrainer, isSel && wg.apptTrainerSel]} numberOfLines={1}>
                                {trainer.full_name}
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                      {slotCancels.map(a => {
                        const cust = customers.find(c => c.id === a.player_id);
                        return (
                          <View key={a.id} style={wg.cancelBlock}>
                            <Text style={wg.cancelLabel} numberOfLines={1}>⚠ Kurzfristig storniert</Text>
                            <Text style={wg.cancelName} numberOfLines={1}>{cust?.full_name ?? '—'}</Text>
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
      </View>

      {/* ── Expanded detail panel ── */}
      {expandedGroupKey && expandedDetail && expandedDetail.length > 0 && (
        <ExpandedDetail
          appts={expandedDetail}
          customers={customers}
          trainers={trainers}
          cancelLoading={cancelLoading}
          cancelError={cancelError}
          onCancelAppt={onCancelAppt}
          onClose={() => onExpandGroup(null)}
        />
      )}

      {bookingDay && (
        <BookingPanel
          day={bookingDay}
          customers={customers}
          trainers={trainers}
          onClose={onCloseBooking}
          onAddAppointment={onAddAppointment}
        />
      )}
    </ScrollView>
  );
}

// Detailpanel eines Termins bzw. einer Gruppe (mit Teilnehmerliste).
function ExpandedDetail({
  appts, customers, trainers, cancelLoading, cancelError, onCancelAppt, onClose,
}: {
  appts: AdminAppointment[];
  customers: CustomerProfile[];
  trainers: TrainerProfile[];
  cancelLoading: boolean;
  cancelError: string | null;
  onCancelAppt: (id: string, reason?: string) => void;
  onClose: () => void;
}) {
  const first = appts[0];
  const color = PROGRAM_COLORS[first.program] ?? C.accent;
  const prog = PROGRAMS.find(p => p.id === first.program);
  const trainer = first.trainer_id ? trainers.find(t => t.id === first.trainer_id) : null;
  const isGrp = PROGRAM_CATEGORY[first.program as ProgramId] === 'gruppe';
  const [cancellingId, setCancellingId] = React.useState<string | null>(null);

  return (
    <View style={s.detailPanel}>
      <View style={[s.detailAccent, { backgroundColor: color }]} />
      <View style={s.detailBody}>
        <Text style={s.detailProgram}>{prog?.name}</Text>
        <Text style={s.detailMeta}>
          {first.time} Uhr{trainer ? ` · ${trainer.full_name}` : ''}
        </Text>

        {isGrp ? (
          <CancelReasonSection placeholder="Grund (optional) – wird dem stornierten Kunden per E-Mail mitgeteilt">
            {reason => (
              <View style={s.participantList}>
                {appts.map(a => {
                  const cust = customers.find(c => c.id === a.player_id);
                  const isThis = cancellingId === a.id;
                  return (
                    <View key={a.id} style={s.participantRow}>
                      <View style={[s.participantDot, { backgroundColor: color }]} />
                      <Text style={s.participantName} numberOfLines={1}>{cust?.full_name ?? '—'}</Text>
                      {cancelError && isThis && <Text style={s.errorText}>{cancelError}</Text>}
                      <TouchableOpacity
                        style={[s.miniStornBtn, cancelLoading && isThis && { opacity: 0.5 }]}
                        onPress={() => { setCancellingId(a.id); onCancelAppt(a.id, reason); }}
                        activeOpacity={0.7}
                        disabled={cancelLoading && isThis}
                      >
                        <Text style={s.miniStornBtnText}>{cancelLoading && isThis ? '…' : 'Stornieren'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </CancelReasonSection>
        ) : (
          <View>
            <Text style={s.detailName}>{customers.find(c => c.id === first.player_id)?.full_name ?? '—'}</Text>
            <CancelReasonSection placeholder="Grund (optional) – wird dem Kunden per E-Mail mitgeteilt">
              {reason => (
                <>
                  {cancelError && <Text style={s.errorText}>{cancelError}</Text>}
                  <TouchableOpacity
                    style={[s.stornBtn, cancelLoading && { opacity: 0.6 }]}
                    onPress={() => onCancelAppt(first.id, reason)}
                    activeOpacity={0.7}
                    disabled={cancelLoading}
                  >
                    <Text style={s.stornBtnText}>{cancelLoading ? 'Stornieren…' : 'Termin stornieren'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </CancelReasonSection>
          </View>
        )}
      </View>
      <TouchableOpacity onPress={onClose} style={s.detailClose}>
        <Text style={s.detailCloseText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}
