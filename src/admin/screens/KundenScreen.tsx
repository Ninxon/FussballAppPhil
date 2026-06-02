import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CustomerProfile, AdminAppointment } from '../hooks/useAdminData';
import { LEVEL_COLORS, LEVEL_LABELS, PlayerLevel, PlayerType } from '../../types';
import { LOCATIONS, Location } from '../../constants/studio';
import { todayStr } from '../../constants/i18n';

interface Props {
  customers: CustomerProfile[];
  allAppointments: AdminAppointment[];
  loading: boolean;
  onSelectCustomer: (id: string) => void;
  onCreateCustomer: (params: {
    email: string;
    full_name: string;
    phone: string;
    birth_date: string;
    address: string;
    parent_name: string;
    player_type: PlayerType | null;
    location: string;
  }) => Promise<{ error: string | null; tempPassword?: string; customerNumber?: number }>;
}

const PLAYER_TYPE_OPTIONS: { id: PlayerType; label: string }[] = [
  { id: 'feldspieler', label: 'Feldspieler' },
  { id: 'torwart', label: 'Torwart' },
];

export function KundenScreen({ customers, allAppointments, loading, onSelectCustomer, onCreateCustomer }: Props) {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<PlayerType | 'all'>('all');
  const [filterLocation, setFilterLocation] = useState<Location | 'all'>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterAppt, setFilterAppt] = useState<'all' | 'with' | 'without'>('all');
  const [showForm, setShowForm] = useState(false);
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formParentName, setFormParentName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formBirth, setFormBirth] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPlayerType, setFormPlayerType] = useState<PlayerType | null>(null);
  const [formLocation, setFormLocation] = useState<Location | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdInfo, setCreatedInfo] = useState<{ name: string; email: string; password: string; number: number } | null>(null);

  const resetForm = () => {
    setFormEmail(''); setFormName(''); setFormPhone('');
    setFormBirth(''); setFormAddress(''); setFormParentName('');
    setFormPlayerType(null); setFormLocation(null);
    setFormError(null); setShowForm(false);
  };

  const doCreate = async () => {
    if (!formName.trim()) { setFormError('Name ist ein Pflichtfeld.'); return; }
    if (!formEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formEmail.trim())) {
      setFormError('Bitte eine gültige E-Mail-Adresse eingeben.');
      return;
    }
    if (!formPlayerType) { setFormError('Bitte einen Spielertyp auswählen.'); return; }
    if (!formLocation) { setFormError('Bitte einen Standort auswählen.'); return; }
    if (formBirth.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const d = new Date(formBirth.trim());
      if (!dateRegex.test(formBirth.trim()) || isNaN(d.getTime()) || d > new Date()) {
        setFormError('Geburtsdatum muss im Format YYYY-MM-DD und in der Vergangenheit liegen.');
        return;
      }
    }
    setFormError(null);
    setFormLoading(true);
    try {
      const { error, tempPassword, customerNumber } = await onCreateCustomer({
        email: formEmail.trim(),
        full_name: formName.trim(),
        phone: formPhone.trim(),
        birth_date: formBirth.trim(),
        address: formAddress.trim(),
        parent_name: formParentName.trim(),
        player_type: formPlayerType,
        location: formLocation,
      });
      if (error) {
        setFormError(error);
      } else {
        setCreatedInfo({ name: formName.trim(), email: formEmail.trim(), password: tempPassword!, number: customerNumber! });
        resetForm();
      }
    } finally {
      setFormLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    let list = customers;
    if (filterType !== 'all') list = list.filter(c => c.player_type === filterType);
    if (filterLocation !== 'all') list = list.filter(c => c.location === filterLocation);
    if (filterActive !== 'all') list = list.filter(c => (filterActive === 'active' ? c.is_active : !c.is_active));
    if (filterAppt !== 'all') {
      const ts = todayStr();
      list = list.filter(c => {
        const hasUpcoming = allAppointments.some(
          a => a.user_id === c.id && a.status === 'confirmed' && a.date >= ts,
        );
        return filterAppt === 'with' ? hasUpcoming : !hasUpcoming;
      });
    }
    if (!q) return list;
    return list.filter(c =>
      (c.full_name ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      String(c.customer_number).includes(q)
    );
  }, [customers, query, filterType, filterLocation, filterActive, filterAppt, allAppointments]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#4A8FE8" />;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Kunden</Text>
        <Text style={styles.count}>{customers.length} gesamt</Text>
      </View>

      {createdInfo && (
        <View style={styles.successBox}>
          <View style={styles.successHeader}>
            <Text style={styles.successTitle}>✓ Kunde #{createdInfo.number} angelegt</Text>
            <TouchableOpacity onPress={() => setCreatedInfo(null)} activeOpacity={0.7}>
              <Text style={styles.successClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.successLine}>{createdInfo.name} · {createdInfo.email}</Text>
          <Text style={styles.successPwLabel}>Temporäres Passwort — bitte dem Kunden mitteilen:</Text>
          <View style={styles.passwordBox}>
            <Text style={styles.passwordText} selectable>{createdInfo.password}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.newBtn} onPress={() => { setShowForm(v => !v); setCreatedInfo(null); }} activeOpacity={0.7}>
        <Text style={styles.newBtnText}>{showForm ? '✕ Abbrechen' : '+ Neuen Kunden anlegen'}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Neuen Kunden anlegen</Text>

          {/* Torwart / Feldspieler */}
          <Text style={styles.fieldLabel}>Spielertyp *</Text>
          <View style={styles.typeRow}>
            {PLAYER_TYPE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.typeChip, formPlayerType === opt.id && styles.typeChipActive]}
                onPress={() => setFormPlayerType(opt.id)}
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
                <Text style={[styles.typeChipText, formPlayerType === opt.id && styles.typeChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Standort */}
          <Text style={styles.fieldLabel}>Standort *</Text>
          <View style={styles.typeRow}>
            {LOCATIONS.map(loc => (
              <TouchableOpacity
                key={loc}
                style={[styles.typeChip, formLocation === loc && styles.typeChipActive]}
                onPress={() => setFormLocation(loc)}
                activeOpacity={0.7}
              >
                <Text style={[styles.typeChipText, formLocation === loc && styles.typeChipTextActive]}>
                  {loc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.formRow}>
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Name des Kindes / Kunden *</Text>
              <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="Max Mustermann" placeholderTextColor="#7A90AE" />
            </View>
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Elternname</Text>
              <TextInput style={styles.input} value={formParentName} onChangeText={setFormParentName} placeholder="Maria Mustermann" placeholderTextColor="#7A90AE" />
            </View>
          </View>
          <View style={styles.formRow}>
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>E-Mail *</Text>
              <TextInput style={styles.input} value={formEmail} onChangeText={setFormEmail} placeholder="max@beispiel.de" placeholderTextColor="#7A90AE" keyboardType="email-address" autoCapitalize="none" />
            </View>
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Telefon</Text>
              <TextInput style={styles.input} value={formPhone} onChangeText={setFormPhone} placeholder="0170 1234567" placeholderTextColor="#7A90AE" keyboardType="phone-pad" />
            </View>
          </View>
          <View style={styles.formRow}>
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Geburtsdatum (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} value={formBirth} onChangeText={setFormBirth} placeholder="2010-05-15" placeholderTextColor="#7A90AE" />
            </View>
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Adresse</Text>
              <TextInput style={styles.input} value={formAddress} onChangeText={setFormAddress} placeholder="Musterstr. 1, 12345 Stadt" placeholderTextColor="#7A90AE" />
            </View>
          </View>
          {formError && <Text style={styles.formError}>{formError}</Text>}
          <TouchableOpacity style={[styles.submitBtn, formLoading && { opacity: 0.6 }]} onPress={doCreate} activeOpacity={0.7} disabled={formLoading}>
            <Text style={styles.submitBtnText}>{formLoading ? 'Wird angelegt...' : 'Kunden anlegen'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter Tabs — mehrere Dimensionen gleichzeitig kombinierbar (UND) */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Typ</Text>
        {(['all', 'feldspieler', 'torwart'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.filterChip, filterType === t && styles.filterChipActive]}
            onPress={() => setFilterType(t)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, filterType === t && styles.filterChipTextActive]}>
              {t === 'all' ? 'Alle' : t === 'feldspieler' ? 'Feldspieler' : 'Torwart'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Standort</Text>
        {(['all', ...LOCATIONS] as const).map(loc => (
          <TouchableOpacity
            key={loc}
            style={[styles.filterChip, filterLocation === loc && styles.filterChipActive]}
            onPress={() => setFilterLocation(loc)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, filterLocation === loc && styles.filterChipTextActive]}>
              {loc === 'all' ? 'Alle' : loc}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Status</Text>
        {([['all', 'Alle'], ['active', 'Aktiv'], ['inactive', 'Inaktiv']] as const).map(([id, label]) => (
          <TouchableOpacity
            key={id}
            style={[styles.filterChip, filterActive === id && styles.filterChipActive]}
            onPress={() => setFilterActive(id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, filterActive === id && styles.filterChipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Termine</Text>
        {([['all', 'Alle'], ['with', 'Mit Terminen'], ['without', 'Keine Termine']] as const).map(([id, label]) => (
          <TouchableOpacity
            key={id}
            style={[styles.filterChip, filterAppt === id && styles.filterChipActive]}
            onPress={() => setFilterAppt(id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, filterAppt === id && styles.filterChipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Name, E-Mail, Telefon oder Kundennummer..."
          placeholderTextColor="#7A90AE"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filtered.length === 0 && (
          <Text style={styles.empty}>Keine Kunden gefunden.</Text>
        )}
        {filtered.map(c => {
          const apptCount = allAppointments.filter(a => a.user_id === c.id && a.status === 'confirmed').length;
          const levelKey = c.level as PlayerLevel | null;
          const isTorwart = c.player_type === 'torwart';
          return (
            <TouchableOpacity
              key={c.id}
              style={styles.row}
              onPress={() => onSelectCustomer(c.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.avatar, { backgroundColor: isTorwart ? 'rgba(155,89,182,0.12)' : 'rgba(74,143,232,0.12)' }]}>
                <Text style={[styles.avatarLetter, { color: isTorwart ? '#9B59B6' : '#4A8FE8' }]}>
                  {isTorwart ? 'T' : 'F'}
                </Text>
              </View>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{c.full_name ?? '—'}</Text>
                  {levelKey && LEVEL_COLORS[levelKey] && (
                    <View style={[styles.levelBadge, { backgroundColor: LEVEL_COLORS[levelKey] + '22', borderColor: LEVEL_COLORS[levelKey] }]}>
                      <Text style={[styles.levelBadgeText, { color: LEVEL_COLORS[levelKey] }]}>
                        {LEVEL_LABELS[levelKey]}
                      </Text>
                    </View>
                  )}
                  {!c.is_active && (
                    <View style={styles.inactiveBadge}>
                      <Text style={styles.inactiveBadgeText}>Inaktiv</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.sub}>
                  {c.parent_name ? `Eltern: ${c.parent_name} · ` : ''}{c.email ?? '—'}
                </Text>
              </View>
              <View style={styles.right}>
                <Text style={styles.customerNr}>#{c.customer_number}</Text>
                <Text style={styles.apptCount}>{apptCount} Termine</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF3FB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 32, paddingBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#152238' },
  count: { fontSize: 14, color: '#4A6080', fontWeight: '500' },
  filterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 32, marginBottom: 12 },
  filterLabel: { fontSize: 11, fontWeight: '700', color: '#7A90AE', textTransform: 'uppercase', letterSpacing: 0.5, width: 64 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: 'rgba(21,34,56,0.08)' },
  filterChipActive: { borderColor: '#4A8FE8', backgroundColor: 'rgba(74,143,232,0.08)' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#4A6080' },
  filterChipTextActive: { color: '#4A8FE8' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F4F8FF', borderRadius: 12, marginHorizontal: 32,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#152238', outlineWidth: 0 } as any,
  clearIcon: { fontSize: 14, color: '#7A90AE', paddingHorizontal: 4 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 32, paddingBottom: 32 },
  empty: { textAlign: 'center', color: '#7A90AE', fontSize: 14, paddingTop: 40 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 10, shadowColor: '#152238', shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 }, shadowRadius: 4, elevation: 1,
    borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 18, fontWeight: '800' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  name: { fontSize: 15, fontWeight: '700', color: '#152238' },
  levelBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  levelBadgeText: { fontSize: 11, fontWeight: '700' },
  inactiveBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(156,163,175,0.15)', borderColor: '#9CA3AF' },
  inactiveBadgeText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  sub: { fontSize: 13, color: '#4A6080' },
  right: { alignItems: 'flex-end', gap: 3 },
  customerNr: { fontSize: 13, fontWeight: '700', color: '#4A8FE8' },
  apptCount: { fontSize: 12, color: '#7A90AE' },
  chevron: { fontSize: 22, color: '#7A90AE', fontWeight: '300', marginLeft: 4 },
  newBtn: {
    marginHorizontal: 32, marginBottom: 16,
    backgroundColor: '#152238', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
    shadowColor: '#152238', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  newBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  form: {
    marginHorizontal: 32, marginBottom: 20,
    backgroundColor: '#fff', borderRadius: 14, padding: 20,
    shadowColor: '#152238', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: '#152238', marginBottom: 16 },
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  typeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(21,34,56,0.08)', backgroundColor: '#F4F8FF',
  },
  typeChipActive: { borderColor: '#4A8FE8', backgroundColor: 'rgba(74,143,232,0.08)' },
  typeChipAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  typeChipAvatarText: { fontSize: 13, fontWeight: '800' },
  typeChipText: { fontSize: 14, fontWeight: '700', color: '#4A6080' },
  typeChipTextActive: { color: '#4A8FE8' },
  formRow: { flexDirection: 'row', gap: 14, marginBottom: 0 },
  formField: { flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#4A6080', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#F4F8FF', borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#152238', outlineWidth: 0,
  } as any,
  submitBtn: {
    marginTop: 20, backgroundColor: '#152238', borderRadius: 10, paddingVertical: 13, alignItems: 'center',
    shadowColor: '#152238', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  formError: { fontSize: 13, color: '#EF4444', fontWeight: '600', marginTop: 12 },
  successBox: {
    marginHorizontal: 32, marginBottom: 16,
    backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#86EFAC',
    borderRadius: 14, padding: 18,
  },
  successHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  successTitle: { fontSize: 15, fontWeight: '800', color: '#15803D' },
  successClose: { fontSize: 16, color: '#4A6080', fontWeight: '600', paddingHorizontal: 4 },
  successLine: { fontSize: 13, color: '#374151', marginBottom: 12 },
  successPwLabel: { fontSize: 12, fontWeight: '700', color: '#4A6080', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  passwordBox: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#86EFAC', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  passwordText: { fontSize: 22, fontWeight: '800', color: '#15803D', letterSpacing: 2, textAlign: 'center' },
});
