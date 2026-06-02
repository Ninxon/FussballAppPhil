import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { AdminTab } from '../types';
import { useAdminData } from './hooks/useAdminData';
import { DashboardScreen } from './screens/DashboardScreen';
import { KundenScreen } from './screens/KundenScreen';
import { KundenDetailScreen } from './screens/KundenDetailScreen';
import { TerminkalenderScreen } from './screens/TerminkalenderScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { ZeitplanScreen } from './screens/ZeitplanScreen';
import { TrainerVideosScreen } from './screens/TrainerVideosScreen';

interface Props {
  onLogout: () => void;
}

const NAV: { id: AdminTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'kunden', label: 'Spieler' },
  { id: 'kalender', label: 'Terminkalender' },
  { id: 'zeitplan', label: 'Zeitplan' },
  { id: 'infos', label: 'Infos' },
  { id: 'videos', label: 'Trainer-Videos' },
];

const TAB_LABELS: Record<AdminTab, string> = {
  dashboard: 'Dashboard',
  kunden: 'Spieler',
  kalender: 'Terminkalender',
  zeitplan: 'Trainerzeitplan',
  infos: 'Infos',
  videos: 'Trainer-Videos',
};

export function AdminApp({ onLogout }: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const {
    customers, allAppointments, trainers, trainerSchedules, trainerMonthlyCounts, activeTokensByCustomer, loading, loadError,
    cancelAppointment, addAppointmentForCustomer, addRecurringAppointments,
    createCustomer, deleteCustomer,
    saveCustomerLevel, saveBookingPermissions, saveCustomerProfile, saveGroupCompatExempt,
    saveCustomerEmail, toggleCustomerActive, resetCustomerTokens,
    setScheduleSlot, createTrainer, updateTrainer, deleteTrainer,
    markAttended,
  } = useAdminData();

  const [calendarDay, setCalendarDay] = useState<string | undefined>(undefined);

  const selectedCustomer = selectedCustomerId
    ? customers.find(c => c.id === selectedCustomerId) ?? null
    : null;

  const navigate = (t: AdminTab, day?: string) => {
    setTab(t);
    setSelectedCustomerId(null);
    if (t === 'kalender') setCalendarDay(day);
    if (isMobile) setSidebarOpen(false);
  };

  const sidebar = (
    <View style={styles.sidebar}>
      <View style={styles.sidebarTop}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoBadgeText}>PK</Text>
        </View>
        <Text style={styles.logoTitle}>Fussballschule</Text>
        <Text style={styles.logoSub}>Administration</Text>
      </View>

      <View style={styles.nav}>
        {NAV.map(item => (
          <TouchableOpacity
            key={item.id}
            style={[styles.navItem, tab === item.id && styles.navItemActive]}
            onPress={() => navigate(item.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.navLabel, tab === item.id && styles.navLabelActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.7}>
        <Text style={styles.logoutIcon}>↩</Text>
        <Text style={styles.logoutText}>Abmelden</Text>
      </TouchableOpacity>
    </View>
  );

  const mainContent = (
    <>
      {loadError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>Hinweis: Fehler beim Laden: {loadError}</Text>
        </View>
      )}
      {tab === 'dashboard' && (
        <DashboardScreen
          customers={customers}
          allAppointments={allAppointments}
          loading={loading}
          onNavigate={navigate}
        />
      )}
      {tab === 'kunden' && !selectedCustomer && (
        <KundenScreen
          customers={customers}
          allAppointments={allAppointments}
          loading={loading}
          onSelectCustomer={setSelectedCustomerId}
          onCreateCustomer={createCustomer}
        />
      )}
      {tab === 'kunden' && selectedCustomer && (
        <KundenDetailScreen
          customer={selectedCustomer}
          appointments={allAppointments.filter(a => a.user_id === selectedCustomer.id)}
          trainers={trainers}
          tokenCounts={activeTokensByCustomer[selectedCustomer.id]}
          onBack={() => setSelectedCustomerId(null)}
          onCancelAppointment={cancelAppointment}
          onAddAppointment={addAppointmentForCustomer}
          onAddRecurring={addRecurringAppointments}
          onSaveLevel={saveCustomerLevel}
          onSaveBookingPermissions={saveBookingPermissions}
          onSaveGroupExempt={saveGroupCompatExempt}
          onSaveProfile={saveCustomerProfile}
          onSaveEmail={saveCustomerEmail}
          onToggleActive={toggleCustomerActive}
          onResetTokens={resetCustomerTokens}
          onMarkAttended={markAttended}
          onDeleteCustomer={async (id) => {
            const { error } = await deleteCustomer(id);
            if (!error) setSelectedCustomerId(null);
            return { error };
          }}
        />
      )}
      {tab === 'kalender' && (
        <TerminkalenderScreen
          customers={customers}
          allAppointments={allAppointments}
          trainers={trainers}
          loading={loading}
          initialDay={calendarDay}
          onCancelAppointment={cancelAppointment}
          onAddAppointment={addAppointmentForCustomer}
        />
      )}
      {tab === 'zeitplan' && (
        <ZeitplanScreen
          trainers={trainers}
          trainerSchedules={trainerSchedules}
          trainerMonthlyCounts={trainerMonthlyCounts}
          onSetSlot={setScheduleSlot}
          onCreateTrainer={createTrainer}
          onUpdateTrainer={updateTrainer}
          onDeleteTrainer={deleteTrainer}
        />
      )}
      {tab === 'infos' && (
        <NotificationsScreen />
      )}
      {tab === 'videos' && (
        <TrainerVideosScreen trainers={trainers} />
      )}
    </>
  );

  if (!isMobile) {
    return (
      <View style={styles.root}>
        {sidebar}
        <View style={styles.main}>{mainContent}</View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.topbar}>
        <TouchableOpacity
          style={styles.hamburger}
          onPress={() => setSidebarOpen(v => !v)}
          activeOpacity={0.7}
        >
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>
        <Text style={styles.topbarTitle}>
          {selectedCustomer ? selectedCustomer.full_name : TAB_LABELS[tab]}
        </Text>
      </View>

      {sidebarOpen && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setSidebarOpen(false)}
          activeOpacity={1}
        />
      )}

      {sidebarOpen && (
        <View style={styles.sidebarDrawer}>
          {sidebar}
        </View>
      )}

      <View style={styles.mainMobile}>{mainContent}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#EEF3FB' },
  sidebar: { width: 220, backgroundColor: '#152238', flexDirection: 'column' },
  sidebarTop: { padding: 24, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: 6 },
  logoBadge: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#152238', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  logoBadgeText: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  logoTitle: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  logoSub: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.4)', letterSpacing: 1.2, textTransform: 'uppercase' },
  nav: { flex: 1, paddingTop: 12 },
  navItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 13,
    marginHorizontal: 8, borderRadius: 0, marginBottom: 2,
    borderLeftWidth: 3, borderLeftColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: 'rgba(74,143,232,0.14)',
    borderLeftColor: '#4A8FE8',
  },
  navLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  navLabelActive: { color: '#4A8FE8' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.06)' },
  logoutIcon: { fontSize: 16, color: 'rgba(255,255,255,0.75)' },
  logoutText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  main: { flex: 1 },
  topbar: { position: 'absolute', top: 0, left: 0, right: 0, height: 56, backgroundColor: '#152238', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 14, zIndex: 20 },
  hamburger: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', gap: 5 },
  hamburgerLine: { width: 22, height: 2, backgroundColor: '#fff', borderRadius: 1 },
  topbarTitle: { fontSize: 16, fontWeight: '700', color: '#fff', flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 30 },
  sidebarDrawer: { position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 40, shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 16 },
  mainMobile: { flex: 1, marginTop: 56 },
  errorBanner: { backgroundColor: '#FEF2F2', borderBottomWidth: 1, borderBottomColor: '#FECACA', paddingHorizontal: 24, paddingVertical: 10 },
  errorBannerText: { fontSize: 13, color: '#DC2626', fontWeight: '600' },
});
