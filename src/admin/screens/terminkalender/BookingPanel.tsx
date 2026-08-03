import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { CustomerProfile, TrainerProfile, MutationResult } from '../../hooks/useAdminData';
import { PROGRAMS, PROGRAM_COLORS } from '../../../constants/programs';
import { fmtDateShort } from '../../../utils/date';
import { C, ALL_SLOTS } from './theme';
import { s } from './styles';

interface Props {
  /** Tag, für den gebucht wird ('YYYY-MM-DD'). */
  day: string;
  customers: CustomerProfile[];
  trainers: TrainerProfile[];
  presetTime?: string;
  onClose: () => void;
  onAddAppointment: (userId: string, date: string, time: string, program: string, trainerId?: string | null) => Promise<MutationResult>;
}

// Buchungsformular des Kalenders. Hält seinen Formularzustand selbst, damit
// Tippen im Kundensuchfeld nicht das gesamte Raster neu rendert.
export function BookingPanel({ day, customers, trainers, presetTime, onClose, onAddAppointment }: Props) {
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [program, setProgram] = useState<string>(PROGRAMS[0].id);
  const [time, setTime] = useState(presetTime ?? ALL_SLOTS[0]);
  const [trainerId, setTrainerId] = useState<string | null>(trainers[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const filteredCustomers = search.trim().length >= 1
    ? customers.filter(c =>
        (c.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        String(c.customer_number).includes(search)
      ).slice(0, 5)
    : [];

  const selectedCustomer = customerId ? customers.find(c => c.id === customerId) : null;

  const doBook = async () => {
    if (!customerId) { setError('Bitte einen Kunden auswählen.'); return; }
    if (!trainerId) { setError('Bitte einen Trainer auswählen.'); return; }
    setLoading(true); setError(null); setSuccess(false);
    const { error: err } = await onAddAppointment(customerId, day, time, program, trainerId);
    setLoading(false);
    if (err) setError(err);
    else { setSuccess(true); setCustomerId(null); setSearch(''); }
  };

  return (
    <View style={s.bookPanel}>
      <View style={s.bookPanelHead}>
        <View>
          <Text style={s.bookPanelTitle}>Termin buchen</Text>
          <Text style={s.bookPanelDate}>{fmtDateShort(day)}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={s.bookPanelClose} activeOpacity={0.7}>
          <Text style={s.bookPanelCloseText}>✕</Text>
        </TouchableOpacity>
      </View>

      {success && (
        <View style={s.successBanner}>
          <Text style={s.successBannerText}>✓  Termin erfolgreich gebucht</Text>
        </View>
      )}

      {/* Kunde */}
      <Text style={s.fieldLabel}>Kunde</Text>
      {selectedCustomer ? (
        <View style={s.selectedCustomer}>
          <View style={[s.selectedCustomerAvatar, { backgroundColor: C.accentMid }]}>
            <Text style={s.selectedCustomerInitial}>
              {(selectedCustomer.full_name ?? '?')[0].toUpperCase()}
            </Text>
          </View>
          <Text style={s.selectedCustomerName}>{selectedCustomer.full_name}</Text>
          <Text style={s.selectedCustomerNum}>#{selectedCustomer.customer_number}</Text>
          <TouchableOpacity onPress={() => { setCustomerId(null); setSearch(''); }} activeOpacity={0.7}>
            <Text style={s.clearBtn}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TextInput
            style={s.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Name oder Kundennummer…"
            placeholderTextColor={C.textFaint}
          />
          {filteredCustomers.map(c => (
            <TouchableOpacity
              key={c.id}
              style={s.suggestion}
              onPress={() => { setCustomerId(c.id); setSearch(''); }}
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
          const active = program === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              style={[s.programChip, { borderColor: active ? color : C.border },
                active && { backgroundColor: color }]}
              onPress={() => setProgram(p.id)}
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
                style={[s.chip, time === t && s.chipActive]}
                onPress={() => setTime(t)}
                activeOpacity={0.7}
              >
                <Text style={[s.chipText, time === t && s.chipTextActive]}>{t}</Text>
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
                  style={[s.chip, trainerId === t.id && s.chipActive]}
                  onPress={() => setTrainerId(t.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.chipText, trainerId === t.id && s.chipTextActive]}>
                    {t.full_name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {error && <Text style={s.errorText}>{error}</Text>}

      <View style={s.bookActions}>
        <TouchableOpacity
          style={[s.bookBtn, (loading || !customerId || !trainerId || trainers.length === 0) && { opacity: 0.45 }]}
          onPress={doBook}
          activeOpacity={0.7}
          disabled={loading || !customerId || !trainerId || trainers.length === 0}
        >
          <Text style={s.bookBtnText}>{loading ? 'Buchen…' : 'Termin buchen'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
