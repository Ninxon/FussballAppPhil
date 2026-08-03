import React, { useState } from 'react';
import { View, ActivityIndicator, useWindowDimensions } from 'react-native';
import { CustomerProfile, AdminAppointment, TrainerProfile, MutationResult } from '../hooks/useAdminData';
import { useBlockedPeriods } from '../../hooks/useBlockedPeriods';
import { C, TIME_COL_W, DAY_COL_MIN, SIDEBAR_W } from './terminkalender/theme';
import { s } from './terminkalender/styles';
import { dateStr, addDays, getWeekStart, weekLabel, fmtDayLong } from './terminkalender/helpers';
import { useAppointmentIndex } from './terminkalender/useAppointmentIndex';
import { PageHeader } from './terminkalender/PageHeader';
import { DayView } from './terminkalender/DayView';
import { WeekView } from './terminkalender/WeekView';

interface Props {
  customers:           CustomerProfile[];
  allAppointments:     AdminAppointment[];
  trainers:            TrainerProfile[];
  loading:             boolean;
  initialDay?:         string;
  onCancelAppointment: (id: string, reason?: string) => Promise<MutationResult>;
  onAddAppointment:    (userId: string, date: string, time: string, program: string, trainerId?: string | null) => Promise<MutationResult>;
}

// Orchestriert Wochen- und Tagesansicht: hält Navigation, Auswahl und den
// Storno-Zustand; die Raster liegen in ./terminkalender/.
export function TerminkalenderScreen({
  customers, allAppointments, trainers, loading, initialDay,
  onCancelAppointment, onAddAppointment,
}: Props) {
  const todayStr = dateStr(new Date());
  const { width: winW } = useWindowDimensions();
  const blockedPeriods = useBlockedPeriods();

  const [viewMode, setViewMode] = useState<'week' | 'day'>(initialDay ? 'day' : 'week');
  const [dayDate, setDayDate] = useState(initialDay ?? todayStr);
  const [weekRef, setWeekRef] = useState(new Date());
  const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [bookingDay, setBookingDay] = useState<string | null>(null);

  const apptIndex = useAppointmentIndex(allAppointments);

  const weekStart = getWeekStart(weekRef);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const switchToDay = (ds: string) => {
    setDayDate(ds); setViewMode('day');
    setBookingDay(null); setSelectedApptId(null); setExpandedGroupKey(null);
  };

  const handleCancelAppt = async (id: string, reason?: string) => {
    setCancelLoading(true); setCancelError(null);
    const { error } = await onCancelAppointment(id, reason);
    setCancelLoading(false);
    if (error) setCancelError(error);
    else { setSelectedApptId(null); setExpandedGroupKey(null); }
  };

  const openBookingDay = (ds: string) => {
    setBookingDay(ds);
    setSelectedApptId(null);
    setExpandedGroupKey(null);
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={C.accent} size="large" />;

  const sidebarW = winW >= 768 ? SIDEBAR_W : 0;
  const gridAvailW = winW - sidebarW - 32;
  const dayColW = Math.max(DAY_COL_MIN, Math.floor((gridAvailW - TIME_COL_W) / 7));

  return (
    <View style={s.root}>
      <PageHeader
        viewMode={viewMode}
        subtitle={viewMode === 'week' ? weekLabel(days) : fmtDayLong(dayDate)}
        onPrev={() => {
          if (viewMode === 'week') { const d = new Date(weekRef); d.setDate(d.getDate() - 7); setWeekRef(d); }
          else setDayDate(addDays(dayDate, -1));
        }}
        onNext={() => {
          if (viewMode === 'week') { const d = new Date(weekRef); d.setDate(d.getDate() + 7); setWeekRef(d); }
          else setDayDate(addDays(dayDate, 1));
        }}
        onToday={() => { setWeekRef(new Date()); setDayDate(todayStr); }}
        onSelectWeek={() => setViewMode('week')}
        onSelectDay={() => switchToDay(dayDate)}
      />

      {viewMode === 'day' ? (
        <DayView
          dayDate={dayDate}
          todayStr={todayStr}
          customers={customers}
          trainers={trainers}
          apptIndex={apptIndex}
          blockedPeriods={blockedPeriods}
          availWidth={gridAvailW}
          selectedApptId={selectedApptId}
          onSelectAppt={id => { setSelectedApptId(id); setCancelError(null); setBookingDay(null); }}
          cancelLoading={cancelLoading}
          cancelError={cancelError}
          onCancelAppt={handleCancelAppt}
          bookingOpen={bookingDay === dayDate}
          onToggleBooking={() => bookingDay === dayDate ? setBookingDay(null) : openBookingDay(dayDate)}
          onCloseBooking={() => setBookingDay(null)}
          onAddAppointment={onAddAppointment}
        />
      ) : (
        <WeekView
          days={days}
          todayStr={todayStr}
          customers={customers}
          trainers={trainers}
          apptIndex={apptIndex}
          allAppointments={allAppointments}
          blockedPeriods={blockedPeriods}
          gridWidth={gridAvailW}
          dayColW={dayColW}
          expandedGroupKey={expandedGroupKey}
          onExpandGroup={key => { setExpandedGroupKey(key); setCancelError(null); setBookingDay(null); }}
          cancelLoading={cancelLoading}
          cancelError={cancelError}
          onCancelAppt={handleCancelAppt}
          onSwitchToDay={switchToDay}
          bookingDay={bookingDay}
          onToggleBookingDay={ds => bookingDay === ds ? setBookingDay(null) : openBookingDay(ds)}
          onCloseBooking={() => setBookingDay(null)}
          onAddAppointment={onAddAppointment}
        />
      )}
    </View>
  );
}
