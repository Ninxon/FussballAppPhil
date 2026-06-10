import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, useWindowDimensions,
} from 'react-native';
import { CustomerProfile, AdminAppointment, TrainerProfile } from '../hooks/useAdminData';
import { PROGRAMS, PROGRAM_CATEGORY, ProgramId } from '../../constants/programs';
import { SLOTS } from '../../constants/slots';
import { isBookableDay } from '../../utils/bookingRules';
import { useBlockedPeriods } from '../../hooks/useBlockedPeriods';

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  bg:           '#EEF3FB',
  surface:      '#FFFFFF',
  dark:         '#152238',
  navy:         '#152238',
  navyMid:      '#1E2E48',
  text:         '#152238',
  textMid:      '#374151',
  textLight:    '#4A6080',
  textFaint:    '#7A90AE',
  border:       'rgba(21,34,56,0.08)',
  borderLight:  '#EEF3FB',
  accent:       '#5A8C6A',
  accentLight:  'rgba(90,140,106,0.1)',
  accentMid:    'rgba(90,140,106,0.22)',
  todayCol:     'rgba(90,140,106,0.06)',
  danger:       '#EF4444',
  dangerBg:     '#FEF2F2',
  successBg:    '#F0FDF4',
  successText:  '#15803D',
  weekendBg:    'rgba(0,0,0,0.018)',
  pastOpacity:  0.45,
};

const PROGRAM_COLORS: Record<string, string> = {
  individual:          '#4A8FE8',
  gruppe:              '#3DBFA0',
  athletik:            '#F5A84A',
  torhueter_individual:'#E87676',
  torhueter_gruppe:    '#9B59B6',
};
const PROGRAM_BG: Record<string, string> = {
  individual:          'rgba(74,143,232,0.10)',
  gruppe:              'rgba(61,191,160,0.10)',
  athletik:            'rgba(245,168,74,0.10)',
  torhueter_individual:'rgba(232,118,118,0.10)',
  torhueter_gruppe:    'rgba(155,89,182,0.10)',
};

// ─── Constants ───────────────────────────────────────────────────────────────
const DE_DAYS       = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DE_MONTHS     = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const ALL_SLOTS     = SLOTS;
const TIME_COL_W    = 68;
const DAY_COL_MIN   = 118;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pad2(n: number) { return String(n).padStart(2, '0'); }
function dateStr(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function fmtDate(ds: string) { const [y,m,d] = ds.split('-'); return `${d}.${m}.${y}`; }
function fmtDayLong(ds: string) {
  const d = new Date(ds + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7;
  return `${DE_DAYS[dow]}, ${d.getDate()}. ${DE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function getWeekStart(ref: Date) {
  const d = new Date(ref);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(ds: string, n: number) {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  customers:           CustomerProfile[];
  allAppointments:     AdminAppointment[];
  trainers:            TrainerProfile[];
  loading:             boolean;
  initialDay?:         string;
  onCancelAppointment: (id: string, reason?: string) => Promise<{ error: any }>;
  onAddAppointment:    (userId: string, date: string, time: string, program: string, trainerId?: string | null) => Promise<{ error: any }>;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function TerminkalenderScreen({
  customers, allAppointments, trainers, loading, initialDay,
  onCancelAppointment, onAddAppointment,
}: Props) {
  const todayStr = dateStr(new Date());
  const { width: winW } = useWindowDimensions();
  const blockedPeriods = useBlockedPeriods();

  const [viewMode,        setViewMode]        = useState<'week'|'day'>(initialDay ? 'day' : 'week');
  const [dayDate,         setDayDate]         = useState(initialDay ?? todayStr);
  const [weekRef,         setWeekRef]         = useState(new Date());
  const [selectedApptId,  setSelectedApptId]  = useState<string | null>(null);
  const [cancelLoading,   setCancelLoading]   = useState(false);
  const [cancelError,     setCancelError]     = useState<string | null>(null);
  const [cancelReason,    setCancelReason]    = useState('');
  const [expandedGroupKey,setExpandedGroupKey]= useState<string | null>(null);

  const [bookingDay,       setBookingDay]       = useState<string | null>(null);
  const [bookCustomerSearch,setBookCustomerSearch]=useState('');
  const [bookCustomerId,   setBookCustomerId]   = useState<string | null>(null);
  const [bookProgram,      setBookProgram]      = useState<string>(PROGRAMS[0].id);
  const [bookTime,         setBookTime]         = useState(SLOTS[0]);
  const [bookTrainerId,    setBookTrainerId]    = useState<string | null>(null);
  const [bookingLoading,   setBookingLoading]   = useState(false);
  const [bookingError,     setBookingError]     = useState<string | null>(null);
  const [bookingSuccess,   setBookingSuccess]   = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────
  const weekStart = getWeekStart(weekRef);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const prevWeek = () => { const d = new Date(weekRef); d.setDate(d.getDate()-7); setWeekRef(d); };
  const nextWeek = () => { const d = new Date(weekRef); d.setDate(d.getDate()+7); setWeekRef(d); };
  const goToday  = () => { setWeekRef(new Date()); setDayDate(todayStr); };

  const weekLabel = (() => {
    const s = days[0], e = days[6];
    if (s.getMonth() === e.getMonth())
      return `${s.getDate()}. – ${e.getDate()}. ${DE_MONTHS[s.getMonth()]} ${s.getFullYear()}`;
    return `${s.getDate()}. ${DE_MONTHS[s.getMonth()]} – ${e.getDate()}. ${DE_MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  })();

  const switchToDay = (ds: string) => {
    setDayDate(ds); setViewMode('day');
    setBookingDay(null); setSelectedApptId(null); setExpandedGroupKey(null);
  };

  const handleCancelAppt = async (id: string, reason?: string) => {
    setCancelLoading(true); setCancelError(null);
    const { error } = await onCancelAppointment(id, reason);
    setCancelLoading(false);
    if (error) setCancelError(error.message ?? 'Fehler beim Stornieren.');
    else { setSelectedApptId(null); setExpandedGroupKey(null); setCancelReason(''); }
  };

  const openBookingDay = (ds: string, presetTime?: string) => {
    setBookingDay(ds);
    setBookCustomerSearch(''); setBookCustomerId(null);
    setBookProgram(PROGRAMS[0].id); setBookTime(presetTime ?? SLOTS[0]);
    setBookTrainerId(trainers[0]?.id ?? null); setBookingError(null); setBookingSuccess(false);
    setSelectedApptId(null); setExpandedGroupKey(null);
  };

  const filteredCustomers = bookCustomerSearch.trim().length >= 1
    ? customers.filter(c =>
        (c.full_name ?? '').toLowerCase().includes(bookCustomerSearch.toLowerCase()) ||
        String(c.customer_number).includes(bookCustomerSearch)
      ).slice(0, 5)
    : [];

  const selectedBookCustomer = bookCustomerId
    ? customers.find(c => c.id === bookCustomerId) : null;

  const doBook = async () => {
    if (!bookCustomerId || !bookingDay) { setBookingError('Bitte einen Kunden auswählen.'); return; }
    if (!bookTrainerId) { setBookingError('Bitte einen Trainer auswählen.'); return; }
    setBookingLoading(true); setBookingError(null); setBookingSuccess(false);
    const { error } = await onAddAppointment(bookCustomerId, bookingDay, bookTime, bookProgram, bookTrainerId);
    setBookingLoading(false);
    if (error) setBookingError(error.message ?? 'Buchung fehlgeschlagen.');
    else { setBookingSuccess(true); setBookCustomerId(null); setBookCustomerSearch(''); }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={C.accent} size="large" />;

  // ── Column widths ─────────────────────────────────────────────────────────
  const sidebarW   = winW >= 768 ? 220 : 0;
  const gridAvailW = winW - sidebarW - 32;
  const dayColW    = Math.max(DAY_COL_MIN, Math.floor((gridAvailW - TIME_COL_W) / 7));

  // ── Shared: Page Header ───────────────────────────────────────────────────
  const pageHeader = (
    <View style={s.pageHeader}>
      <View style={s.pageHeaderLeft}>
        <Text style={s.pageTitle}>Terminkalender</Text>
        <Text style={s.pageSubtitle}>
          {viewMode === 'week' ? weekLabel : fmtDayLong(dayDate)}
        </Text>
      </View>
      <View style={s.pageHeaderRight}>
        <View style={s.navGroup}>
          <TouchableOpacity
            style={s.navBtn}
            onPress={viewMode === 'week' ? prevWeek : () => setDayDate(addDays(dayDate, -1))}
            activeOpacity={0.7}
          >
            <Text style={s.navBtnText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.todayBtn}
            onPress={() => { goToday(); if (viewMode === 'day') setDayDate(todayStr); }}
            activeOpacity={0.7}
          >
            <Text style={s.todayBtnText}>Heute</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.navBtn}
            onPress={viewMode === 'week' ? nextWeek : () => setDayDate(addDays(dayDate, 1))}
            activeOpacity={0.7}
          >
            <Text style={s.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={s.viewToggle}>
          <TouchableOpacity
            style={[s.viewBtn, viewMode === 'week' && s.viewBtnActive]}
            onPress={() => setViewMode('week')}
            activeOpacity={0.7}
          >
            <Text style={[s.viewBtnText, viewMode === 'week' && s.viewBtnTextActive]}>Woche</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.viewBtn, viewMode === 'day' && s.viewBtnActive]}
            onPress={() => switchToDay(dayDate)}
            activeOpacity={0.7}
          >
            <Text style={[s.viewBtnText, viewMode === 'day' && s.viewBtnTextActive]}>Tag</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ── Shared: Booking Panel ─────────────────────────────────────────────────
  const bookingPanel = bookingDay ? (
    <View style={s.bookPanel}>
      <View style={s.bookPanelHead}>
        <View>
          <Text style={s.bookPanelTitle}>Termin buchen</Text>
          <Text style={s.bookPanelDate}>{fmtDate(bookingDay)}</Text>
        </View>
        <TouchableOpacity onPress={() => setBookingDay(null)} style={s.bookPanelClose} activeOpacity={0.7}>
          <Text style={s.bookPanelCloseText}>✕</Text>
        </TouchableOpacity>
      </View>

      {bookingSuccess && (
        <View style={s.successBanner}>
          <Text style={s.successBannerText}>✓  Termin erfolgreich gebucht</Text>
        </View>
      )}

      {/* Kunde */}
      <Text style={s.fieldLabel}>Kunde</Text>
      {selectedBookCustomer ? (
        <View style={s.selectedCustomer}>
          <View style={[s.selectedCustomerAvatar, { backgroundColor: C.accentMid }]}>
            <Text style={s.selectedCustomerInitial}>
              {(selectedBookCustomer.full_name ?? '?')[0].toUpperCase()}
            </Text>
          </View>
          <Text style={s.selectedCustomerName}>{selectedBookCustomer.full_name}</Text>
          <Text style={s.selectedCustomerNum}>#{selectedBookCustomer.customer_number}</Text>
          <TouchableOpacity onPress={() => { setBookCustomerId(null); setBookCustomerSearch(''); }} activeOpacity={0.7}>
            <Text style={s.clearBtn}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TextInput
            style={s.input}
            value={bookCustomerSearch}
            onChangeText={setBookCustomerSearch}
            placeholder="Name oder Kundennummer…"
            placeholderTextColor={C.textFaint}
          />
          {filteredCustomers.map(c => (
            <TouchableOpacity
              key={c.id}
              style={s.suggestion}
              onPress={() => { setBookCustomerId(c.id); setBookCustomerSearch(''); }}
              activeOpacity={0.7}
            >
              <Text style={s.suggestionName}>{c.full_name}</Text>
              <Text style={s.suggestionNum}>#{c.customer_number}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Programm */}
      <Text style={[s.fieldLabel, { marginTop: 16 }]}>Programm</Text>
      <View style={s.programGrid}>
        {PROGRAMS.map(p => {
          const color  = PROGRAM_COLORS[p.id] ?? C.accent;
          const active = bookProgram === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              style={[s.programChip, { borderColor: active ? color : C.border },
                active && { backgroundColor: color }]}
              onPress={() => setBookProgram(p.id)}
              activeOpacity={0.7}
            >
              <Text style={[s.programChipText, active && { color: '#fff' }]}>{p.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Uhrzeit + Trainer */}
      <View style={s.bookRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>Uhrzeit</Text>
          <View style={s.chipRow}>
            {ALL_SLOTS.map(t => (
              <TouchableOpacity
                key={t}
                style={[s.chip, bookTime === t && s.chipActive]}
                onPress={() => setBookTime(t)}
                activeOpacity={0.7}
              >
                <Text style={[s.chipText, bookTime === t && s.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>Trainer *</Text>
          {trainers.length === 0 ? (
            <Text style={s.errorText}>Kein Trainer vorhanden – Buchung nicht möglich.</Text>
          ) : (
            <View style={s.chipRow}>
              {trainers.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[s.chip, bookTrainerId === t.id && s.chipActive]}
                  onPress={() => setBookTrainerId(t.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.chipText, bookTrainerId === t.id && s.chipTextActive]}>
                    {t.full_name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {bookingError && <Text style={s.errorText}>{bookingError}</Text>}

      <View style={s.bookActions}>
        <TouchableOpacity
          style={[s.bookBtn, (bookingLoading || !bookCustomerId || !bookTrainerId || trainers.length === 0) && { opacity: 0.45 }]}
          onPress={doBook}
          activeOpacity={0.7}
          disabled={bookingLoading || !bookCustomerId || !bookTrainerId || trainers.length === 0}
        >
          <Text style={s.bookBtnText}>{bookingLoading ? 'Buchen…' : 'Termin buchen'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  ) : null;

  // ════════════════════════════════════════════════════════════════════════════
  // TAGESANSICHT
  // ════════════════════════════════════════════════════════════════════════════
  if (viewMode === 'day') {
    const dayAppts = allAppointments
      .filter(a => a.date === dayDate && a.status === 'confirmed')
      .sort((a, b) => a.time.localeCompare(b.time));

    const dayCancels = allAppointments.filter(
      a => a.date === dayDate && a.status === 'cancelled' && a.short_notice_cancel,
    );

    const isPast = dayDate < todayStr;
    const canBook = !isPast && isBookableDay(dayDate, blockedPeriods);

    const cols = trainers as TrainerProfile[];
    const numCols = cols.length || 1;
    const availW  = winW - sidebarW - 32 - TIME_COL_W;
    const colW    = Math.max(150, Math.floor(availW / numCols));

    const selAppt   = selectedApptId ? dayAppts.find(a => a.id === selectedApptId) : null;
    const selCust   = selAppt ? customers.find(c => c.id === selAppt.player_id) : null;
    const selProg   = selAppt ? PROGRAMS.find(p => p.id === selAppt.program) : null;
    const selTrainer= selAppt?.trainer_id ? trainers.find(t => t.id === selAppt.trainer_id) : null;
    const selColor  = selAppt ? (PROGRAM_COLORS[selAppt.program] ?? C.accent) : C.accent;

    return (
      <View style={s.root}>
        {pageHeader}
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>

          {/* Day top bar */}
          <View style={s.dayTopBar}>
            {dayDate === todayStr && (
              <View style={s.todayBadge}><Text style={s.todayBadgeText}>Heute</Text></View>
            )}
            {canBook && (
              <TouchableOpacity
                style={s.addBtn}
                onPress={() => bookingDay === dayDate ? setBookingDay(null) : openBookingDay(dayDate)}
                activeOpacity={0.7}
              >
                <Text style={s.addBtnText}>{bookingDay === dayDate ? '✕ Abbrechen' : '+ Termin buchen'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {bookingDay === dayDate && bookingPanel}

          {dayAppts.length === 0 && dayCancels.length === 0 && !bookingDay && (
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
                              const cust  = customers.find(c => c.id === a.player_id);
                              const color = PROGRAM_COLORS[a.program] ?? C.accent;
                              const bg    = PROGRAM_BG[a.program]    ?? C.accentLight;
                              const isSel = selectedApptId === a.id;
                              return (
                                <TouchableOpacity
                                  key={a.id}
                                  style={[dg.apptTag, { borderLeftColor: color },
                                    isSel ? { backgroundColor: color } : { backgroundColor: bg }]}
                                  onPress={() => { setSelectedApptId(isSel ? null : a.id); setCancelError(null); setBookingDay(null); }}
                                  activeOpacity={0.85}
                                >
                                  <Text style={[dg.apptTagText, { color: isSel ? '#fff' : color }]} numberOfLines={1}>
                                    {cust?.full_name ?? '—'}
                                  </Text>
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
                    <TextInput
                      style={s.cancelReasonInput}
                      value={cancelReason}
                      onChangeText={setCancelReason}
                      placeholder="Grund (optional) – wird dem Kunden per E-Mail mitgeteilt"
                      placeholderTextColor={C.textFaint}
                      multiline
                    />
                    {cancelError && <Text style={s.errorText}>{cancelError}</Text>}
                    <TouchableOpacity
                      style={[s.stornBtn, cancelLoading && { opacity: 0.6 }]}
                      onPress={() => handleCancelAppt(selAppt.id, cancelReason)}
                      activeOpacity={0.7}
                      disabled={cancelLoading}
                    >
                      <Text style={s.stornBtnText}>{cancelLoading ? 'Stornieren…' : 'Termin stornieren'}</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => { setSelectedApptId(null); setCancelReason(''); }} style={s.detailClose}>
                    <Text style={s.detailCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // WOCHENANSICHT — Time Grid
  // ════════════════════════════════════════════════════════════════════════════

  // Resolve expanded detail
  const expandedDetail = expandedGroupKey ? (() => {
    // Individual appointments use UUID key; group appointments use pipe-separated key
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(expandedGroupKey);
    if (isUUID) {
      const appt = allAppointments.find(a => a.id === expandedGroupKey && a.status === 'confirmed');
      return appt ? [appt] : null;
    }
    const parts = expandedGroupKey.split('|');
    const [expDate, expTime, expProg, expTrainerId] = parts;
    const appts = allAppointments.filter(a =>
      a.date === expDate && a.time === expTime &&
      a.program === expProg && (a.trainer_id ?? '') === expTrainerId &&
      a.status === 'confirmed'
    );
    return appts.length ? appts : null;
  })() : null;

  return (
    <View style={s.root}>
      {pageHeader}

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* ── Calendar grid card ── */}
        <View style={s.gridCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: gridAvailW }}>

              {/* ── Day header row ── */}
              <View style={wg.headRow}>
                <View style={{ width: TIME_COL_W }} />
                {days.map((day, i) => {
                  const ds       = dateStr(day);
                  const isToday  = ds === todayStr;
                  const isPast   = ds < todayStr;
                  const isWeekend= i >= 5;
                  const canBook  = !isPast && isBookableDay(ds, blockedPeriods);
                  const count    = allAppointments.filter(a => a.date === ds && a.status === 'confirmed').length;
                  const cancelCount = allAppointments.filter(
                    a => a.date === ds && a.status === 'cancelled' && a.short_notice_cancel,
                  ).length;

                  return (
                    <TouchableOpacity
                      key={ds}
                      style={[
                        wg.dayHead, { width: dayColW },
                        isToday   && wg.dayHeadToday,
                        isWeekend && !isToday && wg.dayHeadWeekend,
                      ]}
                      onPress={() => switchToDay(ds)}
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
                          onPress={(e) => { e.stopPropagation?.(); bookingDay === ds ? setBookingDay(null) : openBookingDay(ds); }}
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
                    const ds       = dateStr(day);
                    const isToday  = ds === todayStr;
                    const isPast   = ds < todayStr;
                    const isWeekend= i >= 5;
                    const slotAppts= allAppointments.filter(
                      a => a.date === ds && a.time === slot && a.status === 'confirmed'
                    );
                    const slotCancels = allAppointments.filter(
                      a => a.date === ds && a.time === slot && a.status === 'cancelled' && a.short_notice_cancel
                    );

                    // Group by program+trainer for groups; individual appointments each get their own block
                    const grouped = new Map<string, typeof slotAppts>();
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
                          isToday   && wg.cellToday,
                          isWeekend && wg.cellWeekend,
                          isPast    && !isToday && wg.cellPast,
                        ]}
                      >
                        {Array.from(grouped.entries()).map(([key, appts]) => {
                          const first   = appts[0];
                          const color   = PROGRAM_COLORS[first.program] ?? C.accent;
                          const bg      = PROGRAM_BG[first.program]    ?? C.accentLight;
                          const prog    = PROGRAMS.find(p => p.id === first.program);
                          const trainer = first.trainer_id ? trainers.find(t => t.id === first.trainer_id) : null;
                          const isGrp   = PROGRAM_CATEGORY[first.program as ProgramId] === 'gruppe';
                          const cap     = isGrp ? 4 : 1;
                          const isSel   = expandedGroupKey === key;

                          return (
                            <TouchableOpacity
                              key={key}
                              style={[
                                wg.apptBlock,
                                { borderLeftColor: color },
                                isSel ? { backgroundColor: color } : { backgroundColor: bg },
                              ]}
                              onPress={() => {
                                setExpandedGroupKey(isSel ? null : key);
                                setCancelError(null); setBookingDay(null);
                              }}
                              activeOpacity={0.8}
                            >
                              <View style={wg.apptBlockTop}>
                                <Text style={[wg.apptProg, { color: isSel ? '#fff' : color }]} numberOfLines={1}>
                                  {prog?.name ?? first.program}
                                </Text>
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
        {expandedGroupKey && expandedDetail && expandedDetail.length > 0 && (() => {
          const first   = expandedDetail[0];
          const color   = PROGRAM_COLORS[first.program] ?? C.accent;
          const prog    = PROGRAMS.find(p => p.id === first.program);
          const trainer = first.trainer_id ? trainers.find(t => t.id === first.trainer_id) : null;
          const isGrp   = PROGRAM_CATEGORY[first.program as ProgramId] === 'gruppe';

          return (
            <View style={s.detailPanel}>
              <View style={[s.detailAccent, { backgroundColor: color }]} />
              <View style={s.detailBody}>
                <Text style={s.detailProgram}>
                  {prog?.name}
                </Text>
                <Text style={s.detailMeta}>
                  {first.time} Uhr{trainer ? ` · ${trainer.full_name}` : ''}
                </Text>

                {isGrp ? (
                  <>
                    <TextInput
                      style={s.cancelReasonInput}
                      value={cancelReason}
                      onChangeText={setCancelReason}
                      placeholder="Grund (optional) – wird dem stornierten Kunden per E-Mail mitgeteilt"
                      placeholderTextColor={C.textFaint}
                      multiline
                    />
                    <View style={s.participantList}>
                      {expandedDetail.map(a => {
                        const cust   = customers.find(c => c.id === a.player_id);
                        const isThis = selectedApptId === a.id;
                        return (
                          <View key={a.id} style={s.participantRow}>
                            <View style={[s.participantDot, { backgroundColor: color }]} />
                            <Text style={s.participantName} numberOfLines={1}>{cust?.full_name ?? '—'}</Text>
                            {cancelError && isThis && <Text style={s.errorText}>{cancelError}</Text>}
                            <TouchableOpacity
                              style={[s.miniStornBtn, cancelLoading && isThis && { opacity: 0.5 }]}
                              onPress={() => { setSelectedApptId(a.id); handleCancelAppt(a.id, cancelReason); }}
                              activeOpacity={0.7}
                              disabled={cancelLoading && isThis}
                            >
                              <Text style={s.miniStornBtnText}>{cancelLoading && isThis ? '…' : 'Stornieren'}</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <View>
                    <Text style={s.detailName}>{customers.find(c => c.id === first.player_id)?.full_name ?? '—'}</Text>
                    <TextInput
                      style={s.cancelReasonInput}
                      value={cancelReason}
                      onChangeText={setCancelReason}
                      placeholder="Grund (optional) – wird dem Kunden per E-Mail mitgeteilt"
                      placeholderTextColor={C.textFaint}
                      multiline
                    />
                    {cancelError && <Text style={s.errorText}>{cancelError}</Text>}
                    <TouchableOpacity
                      style={[s.stornBtn, cancelLoading && { opacity: 0.6 }]}
                      onPress={() => handleCancelAppt(first.id, cancelReason)}
                      activeOpacity={0.7}
                      disabled={cancelLoading}
                    >
                      <Text style={s.stornBtnText}>{cancelLoading ? 'Stornieren…' : 'Termin stornieren'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => { setExpandedGroupKey(null); setCancelReason(''); }} style={s.detailClose}>
                <Text style={s.detailCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {bookingPanel}
      </ScrollView>
    </View>
  );
}

// ─── Styles: Page chrome ──────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  scroll:         { flex: 1 },
  scrollContent:  { padding: 16, paddingTop: 0, paddingBottom: 48 },

  // Page header
  pageHeader: {
    paddingHorizontal: 28, paddingVertical: 20,
    backgroundColor: C.surface,
    borderBottomWidth: 1, borderBottomColor: C.border,
    flexDirection: 'row', alignItems: 'center',
    flexWrap: 'wrap', gap: 14,
  },
  pageHeaderLeft:  { flex: 1, minWidth: 200 },
  pageHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  pageTitle:    { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  pageSubtitle: { fontSize: 13, fontWeight: '500', color: C.textLight, marginTop: 2 },

  // Navigation
  navGroup:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navBtn: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  navBtnText:  { fontSize: 18, fontWeight: '600', color: C.textMid, lineHeight: 20 },
  todayBtn: {
    paddingHorizontal: 13, height: 34, borderRadius: 9,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  todayBtnText: { fontSize: 13, fontWeight: '700', color: C.textMid },

  // View toggle
  viewToggle:      { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 9, padding: 3, gap: 2 },
  viewBtn:         { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 7 },
  viewBtnActive:   { backgroundColor: C.surface, shadowColor: '#000', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 1 },
  viewBtnText:     { fontSize: 13, fontWeight: '600', color: C.textLight },
  viewBtnTextActive:{ color: C.text },

  // Calendar grid card
  gridCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#152238',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: C.border,
  },

  // Day view top bar
  dayTopBar:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
  todayBadge:    { backgroundColor: C.accent, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  todayBadgeText:{ fontSize: 12, fontWeight: '700', color: '#fff' },
  addBtn:        { backgroundColor: 'rgba(74,143,232,0.09)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(74,143,232,0.2)' },
  addBtnText:    { fontSize: 13, fontWeight: '700', color: '#4A8FE8' },

  // Empty state
  emptyState:    { backgroundColor: C.surface, borderRadius: 14, padding: 48, alignItems: 'center', gap: 10 },
  emptyText:     { fontSize: 15, color: C.textFaint, fontWeight: '500' },

  // Detail panel (selected appointment)
  detailPanel: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.surface,
    borderRadius: 12, padding: 16, marginBottom: 14,
    gap: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2,
    borderWidth: 1, borderColor: C.border,
  },
  detailAccent:  { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 48 },
  detailBody:    { flex: 1, gap: 3 },
  detailProgram: { fontSize: 13, fontWeight: '700', color: C.textLight },
  detailName:    { fontSize: 17, fontWeight: '800', color: C.text },
  detailMeta:    { fontSize: 13, color: C.textLight },
  detailClose:   { padding: 4 },
  detailCloseText:{ fontSize: 17, color: C.textFaint, fontWeight: '700' },

  // Participant list (group)
  participantList: { gap: 6, marginTop: 10 },
  participantRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  participantDot:  { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  participantName: { flex: 1, fontSize: 13, fontWeight: '600', color: C.textMid },

  miniStornBtn:     { backgroundColor: C.danger, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  miniStornBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  stornBtn:     { backgroundColor: C.danger, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start', marginTop: 8 },
  stornBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  errorText:    { fontSize: 12, color: C.danger, fontWeight: '600', marginTop: 6 },
  cancelReasonInput: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8,
    paddingHorizontal: 11, paddingVertical: 8, fontSize: 13, color: C.text,
    marginTop: 10, minHeight: 52, textAlignVertical: 'top', outlineWidth: 0,
  } as any,

  // ── Booking panel ──────────────────────────────────────────────────────────
  bookPanel: {
    backgroundColor: C.surface, borderRadius: 14, padding: 22, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: C.border,
  },
  bookPanelHead:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  bookPanelTitle:     { fontSize: 17, fontWeight: '800', color: C.text },
  bookPanelDate:      { fontSize: 13, color: C.textLight, marginTop: 2 },
  bookPanelClose:     { padding: 4 },
  bookPanelCloseText: { fontSize: 17, color: C.textFaint, fontWeight: '700' },

  successBanner: { backgroundColor: C.successBg, borderRadius: 8, padding: 12, marginBottom: 14 },
  successBannerText: { fontSize: 13, fontWeight: '700', color: C.successText },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.textFaint, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 },

  // Customer search
  selectedCustomer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.accentLight, borderRadius: 9,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  selectedCustomerAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  selectedCustomerInitial:{ fontSize: 13, fontWeight: '800', color: C.accent },
  selectedCustomerName:   { flex: 1, fontSize: 14, fontWeight: '700', color: C.text },
  selectedCustomerNum:    { fontSize: 12, color: C.textLight },
  clearBtn:               { fontSize: 15, color: C.textFaint, fontWeight: '700', padding: 2 },
  input: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 9,
    paddingHorizontal: 13, paddingVertical: 10, fontSize: 14, color: C.text,
    outlineWidth: 0,
  } as any,
  suggestion: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.bg, borderRadius: 8,
    paddingHorizontal: 13, paddingVertical: 10, marginTop: 4,
  },
  suggestionName: { flex: 1, fontSize: 14, color: C.text, fontWeight: '600' },
  suggestionNum:  { fontSize: 12, color: C.textLight },

  // Program chips
  programGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  programChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9,
    borderWidth: 1.5, backgroundColor: C.surface,
  },
  programChipEmoji: { fontSize: 14 },
  programChipText:  { fontSize: 12, fontWeight: '700', color: C.textMid },

  // Time / trainer chips
  bookRow:  { flexDirection: 'row', gap: 20, marginTop: 16, flexWrap: 'wrap' },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 },
  chip:     { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  chipActive:    { borderColor: C.accent, backgroundColor: C.accentLight },
  chipText:      { fontSize: 12, fontWeight: '600', color: C.textLight },
  chipTextActive:{ color: C.accent },

  bookActions: { marginTop: 18 },
  bookBtn: {
    backgroundColor: C.accent, borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  bookBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ─── Styles: Day grid ─────────────────────────────────────────────────────────
const dg = StyleSheet.create({
  row:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.borderLight, minHeight: 60 },
  rowAlt:    { backgroundColor: '#FAFBFE' },
  headRow:   { backgroundColor: C.navy, borderBottomWidth: 0, minHeight: 52 },
  timeCell:  { justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRightWidth: 1, borderRightColor: C.border },
  trainerCell:{ justifyContent: 'center', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: '#2D3548', gap: 5 },
  headLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  trainerName:{ fontSize: 13, fontWeight: '700', color: '#fff', textAlign: 'center' },
  specialtyPill:{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  specialtyText:{ fontSize: 10, fontWeight: '700', color: '#fff' },
  timeText:  { fontSize: 13, fontWeight: '600', color: C.textLight },
  cell:      { paddingHorizontal: 5, paddingVertical: 5, gap: 4, borderRightWidth: 1, borderRightColor: C.borderLight, justifyContent: 'center' },
  apptTag: {
    borderLeftWidth: 3, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 5,
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  apptTagText: { fontSize: 12, fontWeight: '700', flex: 1 },

  // Kurzfrist-Storno-Marker in der Tagesansicht-Zelle
  cancelTag: {
    borderLeftWidth: 3, borderLeftColor: C.danger, borderRadius: 6,
    backgroundColor: 'rgba(239,68,68,0.07)',
    paddingHorizontal: 8, paddingVertical: 5, gap: 1,
  },
  cancelTagLabel: { fontSize: 9, fontWeight: '800', color: C.danger },
  cancelTagName:  { fontSize: 12, fontWeight: '700', color: C.textMid, textDecorationLine: 'line-through' },
});

// ─── Styles: Week grid ────────────────────────────────────────────────────────
const wg = StyleSheet.create({
  // Day header row (dark navy)
  headRow: {
    flexDirection: 'row',
    backgroundColor: C.navy,
    borderBottomWidth: 2, borderBottomColor: C.navyMid,
  },
  dayHead: {
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 3,
    borderRightWidth: 1, borderRightColor: '#2A3147',
  },
  dayHeadToday:   { backgroundColor: C.accent },
  dayHeadWeekend: { backgroundColor: 'rgba(0,0,0,0.18)' },
  dayName: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  dayNameToday: { color: 'rgba(255,255,255,0.85)' },
  dayNum:       { fontSize: 20, fontWeight: '800', color: '#fff' },
  dayNumToday:  { color: '#fff' },
  faded:        { opacity: 0.4 },

  // Appointment count badge
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1, marginTop: 2,
  },
  countBadgeToday: { backgroundColor: 'rgba(255,255,255,0.25)' },
  countText:       { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  countTextToday:  { color: '#fff' },

  // Kurzfrist-Storno-Marker im Tageskopf
  cancelBadge:     { backgroundColor: 'rgba(239,68,68,0.92)', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1, marginTop: 3 },
  cancelBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  // Add button in day header
  addBtn: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', marginTop: 3,
  },
  addBtnToday:     { backgroundColor: 'rgba(255,255,255,0.25)' },
  addBtnText:      { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.7)', lineHeight: 16 },
  addBtnTextToday: { color: '#fff' },

  // Slot rows
  slotRow:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.borderLight, minHeight: 96 },
  slotRowAlt: { backgroundColor: '#FAFBFE' },

  // Time column cell
  timeCell: {
    justifyContent: 'center', alignItems: 'center',
    paddingVertical: 8, borderRightWidth: 1, borderRightColor: C.border,
  },
  timeText: { fontSize: 12, fontWeight: '600', color: C.textFaint },

  // Day cells
  cell: {
    paddingHorizontal: 5, paddingVertical: 6, gap: 5,
    borderRightWidth: 1, borderRightColor: C.borderLight,
    justifyContent: 'flex-start',
  },
  cellToday:   { backgroundColor: C.todayCol },
  cellWeekend: { backgroundColor: C.weekendBg },
  cellPast:    { opacity: C.pastOpacity },

  // Appointment block
  apptBlock: {
    borderLeftWidth: 3, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 9,
    gap: 3, alignSelf: 'stretch', minWidth: 0,
  },
  apptBlockTop: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  apptProg:     { fontSize: 12, fontWeight: '800', flexShrink: 1, minWidth: 0 },
  apptMeta:     { fontSize: 12, fontWeight: '600', color: C.textMid, flexShrink: 1, minWidth: 0 },
  apptMetaSel:  { color: 'rgba(255,255,255,0.85)' },
  apptTrainer:  { fontSize: 11, color: C.textFaint, flexShrink: 1, minWidth: 0 },
  apptTrainerSel:{ color: 'rgba(255,255,255,0.65)' },

  // Kurzfrist-Storno-Marker in der Zelle
  cancelBlock: {
    borderLeftWidth: 3, borderLeftColor: C.danger, borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.07)',
    paddingHorizontal: 10, paddingVertical: 7, gap: 2, alignSelf: 'stretch',
  },
  cancelLabel: { fontSize: 10, fontWeight: '800', color: C.danger, letterSpacing: 0.2 },
  cancelName:  { fontSize: 12, fontWeight: '600', color: C.textMid, textDecorationLine: 'line-through' },
});
