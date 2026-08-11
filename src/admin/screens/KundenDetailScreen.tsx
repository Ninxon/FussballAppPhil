import React from 'react';
import { ScrollView } from 'react-native';
import { CustomerProfile, AdminAppointment, TrainerProfile, MutationResult, BookingMutationResult } from '../hooks/useAdminData';
import { PlayerLevel, BookingPermissions, SlotReservation, SlotReservationInsert, TrainerSchedule } from '../../types';
import { todayStr } from '../../utils/date';
import { CustomerHeader } from './kundenDetail/CustomerHeader';
import { ContactSection } from './kundenDetail/ContactSection';
import { LevelSection } from './kundenDetail/LevelSection';
import { PermissionsSection } from './kundenDetail/PermissionsSection';
import { IndividualBillingSection } from './kundenDetail/IndividualBillingSection';
import { StammplatzSection } from './kundenDetail/StammplatzSection';
import { AppointmentsSection } from './kundenDetail/AppointmentsSection';
import { styles } from './kundenDetail/styles';

interface Props {
  customer: CustomerProfile;
  appointments: AdminAppointment[];
  trainers: TrainerProfile[];
  trainerSchedules: TrainerSchedule[];
  slotReservations: SlotReservation[];
  tokenCounts?: { individual: number; gruppe: number };
  onBack: () => void;
  onCancelAppointment: (id: string, reason?: string) => Promise<MutationResult>;
  onAddAppointment: (userId: string, date: string, time: string, program: string, trainerId?: string | null, skipGroupCompat?: boolean, skipReservation?: boolean) => Promise<BookingMutationResult>;
  onAddRecurring: (userId: string, dates: string[], time: string, program: string, trainerId?: string | null, skipGroupCompat?: boolean, skipReservation?: boolean) => Promise<{ error: string | null; conflicts: { date: string; reason: string }[]; created: number; reservationConflict?: boolean }>;
  onAddReservation: (row: SlotReservationInsert) => Promise<MutationResult>;
  onRemoveReservation: (id: string) => Promise<MutationResult>;
  onSaveLevel: (customerId: string, level: PlayerLevel | null) => Promise<MutationResult>;
  onSaveBookingPermissions: (customerId: string, permissions: Partial<BookingPermissions>) => Promise<MutationResult>;
  onSaveGroupExempt: (customerId: string, value: boolean) => Promise<MutationResult>;
  onSaveProfile: (customerId: string, fields: Partial<Pick<CustomerProfile, 'full_name' | 'player_type' | 'parent_name' | 'location' | 'birth_date' | 'phone' | 'address'>>) => Promise<MutationResult>;
  onSaveEmail: (customerId: string, email: string) => Promise<MutationResult>;
  onToggleActive: (customerId: string, isActive: boolean) => Promise<MutationResult>;
  onResetTokens: (customerId: string) => Promise<MutationResult>;
  onGrantToken: (customerId: string, category: 'individual' | 'gruppe', expiresDate: string) => Promise<MutationResult>;
  onMarkIndividualBilled: (customerId: string) => Promise<MutationResult>;
  onAdjustIndividualBilling: (customerId: string, delta: number) => Promise<MutationResult>;
  onDeleteCustomer: (id: string) => Promise<MutationResult>;
}

// Komposition der Kundendetail-Sektionen. Jede Sektion (siehe ./kundenDetail/)
// haelt ihren eigenen Formular- und Fehlerzustand; hier bleiben nur die aus
// den Terminen abgeleiteten Listen, die mehrere Sektionen brauchen.
export function KundenDetailScreen({
  customer, appointments, trainers, trainerSchedules, slotReservations, tokenCounts,
  onBack, onCancelAppointment, onAddAppointment, onAddRecurring,
  onAddReservation, onRemoveReservation,
  onSaveLevel, onSaveBookingPermissions, onSaveGroupExempt, onSaveProfile, onSaveEmail,
  onToggleActive, onResetTokens, onGrantToken, onMarkIndividualBilled,
  onAdjustIndividualBilling, onDeleteCustomer,
}: Props) {
  const ts = todayStr();

  const { confirmedTotal, upcoming, past } = React.useMemo(() => ({
    // Nur bereits stattgefundene Termine — "gesamt" inkl. Zukunft war nicht interpretierbar.
    confirmedTotal: appointments.filter(a => a.status === 'confirmed' && a.date < ts).length,
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

      <IndividualBillingSection
        customerId={customer.id}
        appointments={appointments}
        billedSince={customer.individual_billed_since}
        adjust={customer.individual_billing_adjust}
        todayStr={ts}
        onMarkIndividualBilled={onMarkIndividualBilled}
        onAdjustIndividualBilling={onAdjustIndividualBilling}
      />

      <StammplatzSection
        customer={customer}
        slotReservations={slotReservations}
        trainers={trainers}
        trainerSchedules={trainerSchedules}
        onAddReservation={onAddReservation}
        onRemoveReservation={onRemoveReservation}
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
