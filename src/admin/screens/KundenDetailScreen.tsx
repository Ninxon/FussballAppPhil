import React from 'react';
import { ScrollView } from 'react-native';
import { CustomerProfile, AdminAppointment, TrainerProfile, MutationResult } from '../hooks/useAdminData';
import { PlayerLevel, BookingPermissions } from '../../types';
import { todayStr } from '../../utils/date';
import { CustomerHeader } from './kundenDetail/CustomerHeader';
import { ContactSection } from './kundenDetail/ContactSection';
import { LevelSection } from './kundenDetail/LevelSection';
import { PermissionsSection } from './kundenDetail/PermissionsSection';
import { AttendanceSection } from './kundenDetail/AttendanceSection';
import { AppointmentsSection } from './kundenDetail/AppointmentsSection';
import { styles } from './kundenDetail/styles';

interface Props {
  customer: CustomerProfile;
  appointments: AdminAppointment[];
  trainers: TrainerProfile[];
  tokenCounts?: { individual: number; gruppe: number };
  onBack: () => void;
  onCancelAppointment: (id: string, reason?: string) => Promise<MutationResult>;
  onAddAppointment: (userId: string, date: string, time: string, program: string, trainerId?: string | null, skipGroupCompat?: boolean) => Promise<MutationResult>;
  onAddRecurring: (userId: string, dates: string[], time: string, program: string, trainerId?: string | null, skipGroupCompat?: boolean) => Promise<{ error: string | null; conflicts: { date: string; reason: string }[]; created: number }>;
  onSaveLevel: (customerId: string, level: PlayerLevel | null) => Promise<MutationResult>;
  onSaveBookingPermissions: (customerId: string, permissions: Partial<BookingPermissions>) => Promise<MutationResult>;
  onSaveGroupExempt: (customerId: string, value: boolean) => Promise<MutationResult>;
  onSaveProfile: (customerId: string, fields: Partial<Pick<CustomerProfile, 'full_name' | 'player_type' | 'parent_name' | 'location' | 'birth_date' | 'phone' | 'address'>>) => Promise<MutationResult>;
  onSaveEmail: (customerId: string, email: string) => Promise<MutationResult>;
  onToggleActive: (customerId: string, isActive: boolean) => Promise<MutationResult>;
  onResetTokens: (customerId: string) => Promise<MutationResult>;
  onGrantToken: (customerId: string, category: 'individual' | 'gruppe', expiresDate: string) => Promise<MutationResult>;
  onMarkAttended: (apptId: string, attended: boolean | null) => Promise<MutationResult>;
  onDeleteCustomer: (id: string) => Promise<MutationResult>;
}

// Komposition der Kundendetail-Sektionen. Jede Sektion (siehe ./kundenDetail/)
// haelt ihren eigenen Formular- und Fehlerzustand; hier bleiben nur die aus
// den Terminen abgeleiteten Listen, die mehrere Sektionen brauchen.
export function KundenDetailScreen({
  customer, appointments, trainers, tokenCounts,
  onBack, onCancelAppointment, onAddAppointment, onAddRecurring,
  onSaveLevel, onSaveBookingPermissions, onSaveGroupExempt, onSaveProfile, onSaveEmail,
  onToggleActive, onResetTokens, onGrantToken, onMarkAttended, onDeleteCustomer,
}: Props) {
  const ts = todayStr();

  const { confirmedTotal, upcoming, past } = React.useMemo(() => ({
    confirmedTotal: appointments.filter(a => a.status === 'confirmed').length,
    upcoming: appointments
      .filter(a => a.date >= ts && a.status === 'confirmed')
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    past: appointments
      .filter(a => a.date < ts || a.status === 'cancelled')
      .sort((a, b) => b.date.localeCompare(a.date)),
  }), [appointments, ts]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <CustomerHeader
        customer={customer}
        upcomingCount={upcoming.length}
        onBack={onBack}
        onDeleteCustomer={onDeleteCustomer}
      />

      <ContactSection
        customer={customer}
        onSaveProfile={onSaveProfile}
        onSaveEmail={onSaveEmail}
        onToggleActive={onToggleActive}
      />

      <LevelSection customer={customer} onSaveLevel={onSaveLevel} />

      <PermissionsSection
        customer={customer}
        tokenCounts={tokenCounts}
        confirmedTotal={confirmedTotal}
        onSaveBookingPermissions={onSaveBookingPermissions}
        onSaveGroupExempt={onSaveGroupExempt}
        onResetTokens={onResetTokens}
        onGrantToken={onGrantToken}
      />

      <AttendanceSection
        appointments={appointments}
        todayStr={ts}
        onMarkAttended={onMarkAttended}
      />

      <AppointmentsSection
        customer={customer}
        trainers={trainers}
        todayStr={ts}
        upcoming={upcoming}
        past={past}
        appointments={appointments}
        onCancelAppointment={onCancelAppointment}
        onAddAppointment={onAddAppointment}
        onAddRecurring={onAddRecurring}
      />
    </ScrollView>
  );
}
