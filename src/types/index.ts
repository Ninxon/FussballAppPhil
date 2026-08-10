import type { Location } from '../constants/studio';
export type { Location };

export type AppointmentStatus = 'confirmed' | 'cancelled';

export type Appointment = {
  id: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  program: string;
  player_id?: string;
  trainer_id?: string | null;
  session_level?: string | null;
  session_birth_year?: number | null;
  is_makeup?: boolean;
  makeup_count?: number;
  location?: Location | null;
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
  location?: Location | null;
};

export type PlayerLevel = 'anfaenger' | 'amateur' | 'profi' | 'experte';
export type PlayerType = 'torwart' | 'feldspieler';

// Ein Spieler (Kind) gehoert zu einem Eltern-Account (parent_id -> profiles.id).
// Level, Typ, Buchungsberechtigungen und Standort haengen pro Spieler.
export type Player = {
  id: string;
  parent_id: string;
  name: string;
  birth_date?: string | null;
  level?: PlayerLevel | null;
  player_type?: PlayerType | null;
  can_book_individual: boolean;
  can_book_gruppe: boolean;
  can_book_athletik: boolean;
  can_book_torhueter_individual: boolean;
  can_book_torhueter_gruppe: boolean;
  skip_group_age_level_check: boolean;
  location?: Location | null;
  player_number?: number | null;
  is_active: boolean;
  created_at?: string;
};

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
  player_id: string;
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

// ── Video-Pakete ────────────────────────────────────────────────────────────
// Ein Video liegt in der Bibliothek und gehoert keinem Trainer. Sichtbar wird
// es ueber ein Paket, das einem Trainer zugewiesen ist.

export type VideoAsset = {
  id: string;
  title: string;
  description: string | null;
  /** Externer Link; NULL, wenn die Datei im Storage liegt. */
  url: string | null;
  /** Objektpfad im Bucket 'trainer-videos'; NULL bei externem Link. */
  storage_path: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  original_filename?: string | null;
  created_at?: string;
};

export type VideoPackage = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  videos: VideoAsset[];
};

/**
 * Eine Verteilung: an wen, und optional zu welcher Uhrzeit.
 *
 * Die Uhrzeit haengt an der Zuweisung, nicht am Paket — dasselbe Paket kann
 * bei zwei Trainern zu verschiedenen Zeiten laufen.
 */
export type PackageAssignment = {
  trainerId: string;
  /** 'HH:MM' aus SLOTS (src/constants/slots.ts) oder null. Ohne Datum, ohne Zeitzone. */
  scheduledTime: string | null;
};

/** Ergaenzt ein Paket in der Admin-Sicht um die Verteilung. */
export type AdminVideoPackage = VideoPackage & {
  assignments: PackageAssignment[];
};

export type VideoStorageUsage = {
  file_count: number;
  total_bytes: number;
  orphan_count: number;
  orphan_bytes: number;
};

export type SlotCount = {
  date: string;
  time: string;
  program: string;
  location: Location | null;
  booked: number;
};

export type SlotPlayer = {
  date: string;
  time: string;
  program: string;
  location: Location | null;
  session_birth_year: number;
  session_level: string | null;
  created_at: string;
};

// Stammplatz: ein wiederkehrender Einzeltraining-Slot, der fuer genau einen
// Spieler freigehalten wird. Erzeugt KEINE Termine — er haelt nur einen
// Trainerplatz frei, damit ein Nachholtermin ihn nicht wegschnappt.
export type ReservationProgram = 'individual' | 'torhueter_individual';

export type SlotReservation = {
  id: string;
  player_id: string;
  /** 1 = Montag … 5 = Freitag (Wochenenden sind nicht buchbar). */
  day_of_week: number;
  time: string;
  location: Location;
  program: ReservationProgram;
  note?: string | null;
  created_at?: string;
};

export type SlotReservationInsert = {
  player_id: string;
  day_of_week: number;
  time: string;
  location: Location;
  program: ReservationProgram;
  note?: string | null;
};

// Anonyme Sicht (get_slot_reservations): pro konkretem Datum aufgeloest, weil
// nur der Server weiss, ob der Inhaber dort bereits gebucht hat.
export type SlotReservationCount = {
  date: string;
  time: string;
  location: Location;
  specialty: TrainerSpecialty;
  /** Von anderen Spielern belegte Trainerplaetze. */
  blocked: number;
  /** Reservierungen der eigenen Kinder — fuer die Kennzeichnung im Slot. */
  mine: number;
};
