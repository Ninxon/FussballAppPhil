import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { CustomerProfile, AdminAppointment } from '../hooks/useAdminData';
import { PROGRAMS } from '../../constants/programs';
import { AdminTab } from '../../types';

const PROGRAM_COLORS: Record<string, string> = {
  individual: '#4A8FE8', gruppe: '#3DBFA0', athletik: '#F5A84A',
  torhueter_individual: '#E87676', torhueter_gruppe: '#9B59B6',
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekEnd() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(ds: string) {
  const [y, m, d] = ds.split('-');
  return `${d}.${m}.${y}`;
}

interface Props {
  customers: CustomerProfile[];
  allAppointments: AdminAppointment[];
  loading: boolean;
  onNavigate: (tab: AdminTab, day?: string) => void;
}

function StatCard({ label, value, color, onPress }: { label: string; value: string | number; color?: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={onPress ? 0.75 : 1}>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {onPress && <Text style={styles.statArrow}>›</Text>}
    </TouchableOpacity>
  );
}

export function DashboardScreen({ customers, allAppointments, loading, onNavigate }: Props) {
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#4A8FE8" />;

  const ts = todayStr();
  const we = weekEnd();

  const todayAppts = allAppointments.filter(a => a.date === ts && a.status === 'confirmed');
  const weekAppts = allAppointments.filter(a => a.date >= ts && a.date <= we && a.status === 'confirmed');
  const activeCustomers = customers.filter(c => c.is_active);
  const upcoming = allAppointments
    .filter(a => a.date >= ts && a.status === 'confirmed')
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 10);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dashboard</Text>

      <View style={styles.statsRow}>
        <StatCard
          label="Aktive Spieler"
          value={activeCustomers.length}
          color="#4A8FE8"
          onPress={() => onNavigate('kunden')}
        />
        <StatCard
          label="Heute"
          value={todayAppts.length}
          color="#3DBFA0"
          onPress={() => onNavigate('kalender', ts)}
        />
        <StatCard
          label="Diese Woche"
          value={weekAppts.length}
          color="#F5A84A"
          onPress={() => onNavigate('kalender')}
        />
      </View>

      <Text style={styles.sectionTitle}>Nächste Termine</Text>
      {upcoming.length === 0 ? (
        <Text style={styles.empty}>Keine bevorstehenden Termine.</Text>
      ) : (
        upcoming.map(a => {
          const customer = customers.find(c => c.id === a.player_id);
          const prog = PROGRAMS.find(p => p.id === a.program);
          const color = PROGRAM_COLORS[a.program] ?? '#4A8FE8';
          return (
            <View key={a.id} style={styles.apptRow}>
              <View style={[styles.colorDot, { backgroundColor: color }]} />
              <View style={styles.apptInfo}>
                <Text style={styles.apptName}>{customer?.full_name ?? '—'}</Text>
                <Text style={styles.apptMeta}>{prog?.name ?? a.program}</Text>
              </View>
              <Text style={styles.apptDate}>{fmtDate(a.date)} · {a.time} Uhr</Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF3FB' },
  content: { padding: 32 },
  title: { fontSize: 26, fontWeight: '800', color: '#152238', marginBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 36, flexWrap: 'wrap' },
  statCard: {
    flex: 1, minWidth: 120, backgroundColor: '#fff', borderRadius: 14,
    padding: 20, shadowColor: '#152238', shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2,
    position: 'relative',
    borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
  },
  statValue: { fontSize: 32, fontWeight: '800', color: '#152238', marginBottom: 4 },
  statLabel: { fontSize: 13, color: '#4A6080', fontWeight: '500' },
  statArrow: { position: 'absolute', right: 14, top: 14, fontSize: 20, color: '#7A90AE' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#152238', marginBottom: 12 },
  empty: { color: '#7A90AE', fontSize: 14, paddingVertical: 20, textAlign: 'center' },
  apptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 8, shadowColor: '#152238', shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 }, shadowRadius: 4, elevation: 1,
    borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  apptInfo: { flex: 1 },
  apptName: { fontSize: 14, fontWeight: '700', color: '#152238' },
  apptMeta: { fontSize: 12, color: '#4A6080', marginTop: 2 },
  apptDate: { fontSize: 13, color: '#4A6080', fontWeight: '500' },
});
