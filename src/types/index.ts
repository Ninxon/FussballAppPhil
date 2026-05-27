export type AppointmentStatus = 'confirmed' | 'cancelled';

export type Appointment = {
  id: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  program: string;
  user_id?: string;
  trainer_id?: string | null;
  session_level?: string | null;
  session_birth_year?: number | null;
  is_makeup?: boolean;
  makeup_count?: number;
  location?: 'Rüsselsheim' | 'Kelsterbach' | null;
  created_at?: string;
};

export type Tab = 'home' | 'termine' | 'buchen' | 'infos' | 'profil';
export type AdminTab = 'dashboard' | 'kunden' | 'kalender' | 'infos' | 'zeitplan' | 'videos';

export type TrainerSpecialty = 'spieler' | 'torwart';

export type TrainerSchedule = {
  id: string;
  trainer_id: string;
  day_of_week: number;
  time: string;
  location?: 'Rüsselsheim' | 'Kelsterbach' | null;
};

export type PlayerLevel = 'anfaenger' | 'amateur' | 'profi' | 'experte';
export type PlayerType = 'torwart' | 'feldspieler';

export const LEVEL_COLORS: Record<PlayerLevel, string> = {
  anfaenger: '#4CAF50',
  amateur:   '#FFC107',
  profi:     '#FF9800',
  experte:   '#F44336',
};

export const LEVEL_LABELS: Record<PlayerLevel, string> = {
  anfaenger: 'Anfänger',
  amateur:   'Amateur',
  profi:     'Profi',
  experte:   'Experte',
};

export type ProgramCategory = 'individual' | 'gruppe';

export type CancellationToken = {
  id: string;
  user_id: string;
  category: ProgramCategory;
  issued_at: string;
  expires_at: string;
  used_at: string | null;
  source_appointment_id: string | null;
};

export type BookingPermissions = {
  can_book_individual: boolean;
  can_book_gruppe: boolean;
  can_book_athletik: boolean;
  can_book_torhueter_individual: boolean;
  can_book_torhueter_gruppe: boolean;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  location: string | null;
  created_at: string;
  is_global: boolean;
};

export type SlotCount = {
  date: string;
  time: string;
  program: string;
  location: 'Rüsselsheim' | 'Kelsterbach' | null;
  booked: number;
};

export type SlotPlayer = {
  date: string;
  time: string;
  program: string;
  location: 'Rüsselsheim' | 'Kelsterbach' | null;
  session_birth_year: number;
  session_level: string | null;
  created_at: string;
};
