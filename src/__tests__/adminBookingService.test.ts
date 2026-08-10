/**
 * Tests der Admin-Buchungsregeln. validateBookingRules ist bewusst pur
 * (Kontext kommt als Parameter), daher ohne React/Supabase testbar.
 */
import { validateBookingRules, BookingContext } from '../admin/services/bookingValidation';
import type { CustomerProfile, AdminAppointment, TrainerProfile } from '../admin/hooks/useAdminData';

const customer = (over: Partial<CustomerProfile> = {}): CustomerProfile => ({
  id: 'p1', parent_id: 'e1', full_name: 'Max Muster', email: 'max@test.de', phone: '',
  birth_date: '2014-05-01', address: null, parent_name: null, location: 'Rüsselsheim',
  player_type: 'feldspieler', customer_number: 101, is_active: true, role: 'customer',
  level: 'amateur', skip_group_age_level_check: false, individual_billed_since: '2026-06-01',
  can_book_individual: true, can_book_gruppe: true, can_book_athletik: true,
  can_book_torhueter_individual: false, can_book_torhueter_gruppe: false,
  ...over,
});

const trainer = (over: Partial<TrainerProfile> = {}): TrainerProfile => ({
  id: 't1', full_name: 'Trainer Tom', trainer_specialty: 'spieler', ...over,
});

const ctx = (over: Partial<BookingContext> = {}): BookingContext => ({
  customers: [customer()],
  allAppointments: [],
  trainers: [trainer()],
  // 2026-06-15 ist ein Montag -> day_of_week 1
  trainerSchedules: [{ id: 's1', trainer_id: 't1', day_of_week: 1, time: '16:00', location: 'Rüsselsheim' } as any],
  ...over,
});

const NOW = new Date('2026-06-01T10:00:00');
const req = (over: any = {}) => ({
  playerId: 'p1', date: '2026-06-15', time: '16:00', program: 'gruppe', trainerId: 't1', ...over,
});

describe('validateBookingRules — Zeitfenster', () => {
  test('Datum in der Vergangenheit wird abgelehnt', () => {
    const r = validateBookingRules(ctx(), req({ date: '2026-05-30' }), NOW);
    expect(r).toMatch(/Vergangenheit/);
  });

  test('heutige Uhrzeit in der Vergangenheit wird abgelehnt', () => {
    const r = validateBookingRules(ctx(), req({ date: '2026-06-01', time: '09:00' }), NOW);
    expect(r).toMatch(/Uhrzeit liegt bereits in der Vergangenheit/);
  });

  test('zukünftiger Termin ist erlaubt', () => {
    expect(validateBookingRules(ctx(), req(), NOW)).toBeNull();
  });
});

describe('validateBookingRules — Berechtigungen', () => {
  test('fehlende Programm-Berechtigung wird abgelehnt', () => {
    const c = ctx({ customers: [customer({ can_book_gruppe: false })] });
    expect(validateBookingRules(c, req(), NOW)).not.toBeNull();
  });

  // Dokumentiert bewusst den Ist-Zustand: der Admin-Pfad prüft NUR die
  // can_book_*-Flags. Die zusätzliche Spielertyp-Regel (Torwart bucht keine
  // Feldspieler-Programme) greift ausschließlich im Kunden-Buchungsflow
  // (isProgramAllowed in BuchenScreen) — der Admin kann sie überstimmen.
  test('Admin darf einen Torwart mit gesetztem Flag ins Gruppentraining buchen', () => {
    const c = ctx({ customers: [customer({ player_type: 'torwart', can_book_gruppe: true })] });
    expect(validateBookingRules(c, req({ program: 'gruppe' }), NOW)).toBeNull();
  });
});

describe('validateBookingRules — Trainer-Zeitplan', () => {
  test('Trainer ohne Slot zu dieser Zeit wird abgelehnt', () => {
    const r = validateBookingRules(ctx(), req({ time: '18:00' }), NOW);
    expect(r).toMatch(/keinen Unterricht eingeplant/);
  });

  // Frueher entfiel ohne Trainer die Zeitplan-Pruefung und der Termin wurde ohne
  // Standort angelegt. Der Standort haengt am Trainer-Slot und ist Pflicht
  // (appointments.location NOT NULL), also ist die Buchung ohne Trainer ungueltig.
  test('ohne Trainer wird die Buchung abgelehnt (Standort haengt am Trainer)', () => {
    const r = validateBookingRules(ctx(), req({ trainerId: null, time: '18:00' }), NOW);
    expect(r).toMatch(/Trainer/);
  });

  test('Spieler-Trainer kann im Slot nicht Individual und Gruppe mischen', () => {
    const existing: AdminAppointment = {
      id: 'a1', player_id: 'p9', date: '2026-06-15', time: '16:00',
      status: 'confirmed', program: 'individual', trainer_id: 't1',
    };
    const r = validateBookingRules(ctx({ allAppointments: [existing] }), req(), NOW);
    expect(r).toMatch(/bereits Individualtraining/);
  });
});

describe('validateBookingRules — Gruppen-Kompatibilität', () => {
  const incompatible: AdminAppointment = {
    id: 'a1', player_id: 'p9', date: '2026-06-15', time: '16:00',
    status: 'confirmed', program: 'gruppe', trainer_id: 't1',
    session_birth_year: 2004, session_level: 'experte',
  };

  test('unpassender Jahrgang/Level in der Gruppe wird abgelehnt', () => {
    expect(validateBookingRules(ctx({ allAppointments: [incompatible] }), req(), NOW)).not.toBeNull();
  });

  test('skipGroupCompat übergeht NUR die Kompatibilitätsprüfung', () => {
    const r = validateBookingRules(
      ctx({ allAppointments: [incompatible] }), req({ skipGroupCompat: true }), NOW,
    );
    expect(r).toBeNull();
  });

  test('Profil-Flag skip_group_age_level_check wirkt genauso', () => {
    const c = ctx({
      customers: [customer({ skip_group_age_level_check: true })],
      allAppointments: [incompatible],
    });
    expect(validateBookingRules(c, req(), NOW)).toBeNull();
  });

  test('Individualtraining ist von der Gruppenprüfung nicht betroffen', () => {
    const c = ctx({ allAppointments: [] });
    expect(validateBookingRules(c, req({ program: 'individual' }), NOW)).toBeNull();
  });
});

// ── Stammplatz (slot_reservations) ──────────────────────────────────────────
// Reservierungen haengen an (Wochentag, Uhrzeit, Standort), nicht an einem
// Trainer. Die Regel zaehlt daher freie Trainer gegen offene Reservierungen,
// statt einen bestimmten Trainer zu sperren.
describe('validateBookingRules — fester Trainingsplatz', () => {
  const reservation = (over: any = {}) => ({
    id: 'r1', player_id: 'p2', day_of_week: 1, time: '16:00',
    location: 'Rüsselsheim', program: 'individual', ...over,
  });

  const trainerSchedules = [
    { id: 's1', trainer_id: 't1', day_of_week: 1, time: '16:00', location: 'Rüsselsheim' },
    { id: 's2', trainer_id: 't2', day_of_week: 1, time: '16:00', location: 'Rüsselsheim' },
  ] as any;

  const twoTrainers = (over: Partial<BookingContext> = {}) => ctx({
    customers: [customer(), customer({ id: 'p2', full_name: 'Lena Lang' })],
    trainers: [trainer(), trainer({ id: 't2', full_name: 'Trainer Tim' })],
    trainerSchedules,
    ...over,
  });

  test('einziger Trainer ist reserviert -> Buchung fuer ein anderes Kind abgelehnt', () => {
    const c = ctx({
      customers: [customer(), customer({ id: 'p2', full_name: 'Lena Lang' })],
      slotReservations: [reservation()],
    });
    const r = validateBookingRules(c, req({ program: 'individual' }), NOW);
    expect(r).toMatch(/fester Trainingsplatz von Lena Lang/);
  });

  test('der Inhaber selbst wird nicht ausgesperrt', () => {
    const c = ctx({ slotReservations: [reservation({ player_id: 'p1' })] });
    expect(validateBookingRules(c, req({ program: 'individual' }), NOW)).toBeNull();
  });

  test('skipReservation uebergeht die Sperre (Admin-Entscheidung)', () => {
    const c = ctx({
      customers: [customer(), customer({ id: 'p2', full_name: 'Lena Lang' })],
      slotReservations: [reservation()],
    });
    expect(validateBookingRules(c, req({ program: 'individual', skipReservation: true }), NOW)).toBeNull();
  });

  test('zweiter freier Trainer am Slot -> Buchung bleibt moeglich', () => {
    const c = twoTrainers({ slotReservations: [reservation()] });
    expect(validateBookingRules(c, req({ program: 'individual' }), NOW)).toBeNull();
  });

  test('zweiter Trainer bereits belegt -> letzter freier Trainer ist geschuetzt', () => {
    const c = twoTrainers({
      slotReservations: [reservation()],
      allAppointments: [{
        id: 'a1', player_id: 'p9', date: '2026-06-15', time: '16:00', status: 'confirmed',
        program: 'individual', trainer_id: 't2', location: 'Rüsselsheim',
      } as AdminAppointment],
    });
    expect(validateBookingRules(c, req({ program: 'individual' }), NOW)).not.toBeNull();
  });

  // Verbrauchte Reservierung: hat der Inhaber an diesem Datum schon gebucht,
  // haelt sie keinen zweiten Trainer mehr frei.
  test('Inhaber hat an diesem Tag bereits gebucht -> Slot wieder frei', () => {
    const c = twoTrainers({
      slotReservations: [reservation()],
      allAppointments: [{
        id: 'a1', player_id: 'p2', date: '2026-06-15', time: '16:00', status: 'confirmed',
        program: 'individual', trainer_id: 't2', location: 'Rüsselsheim',
      } as AdminAppointment],
    });
    expect(validateBookingRules(c, req({ program: 'individual' }), NOW)).toBeNull();
  });

  test('Torwart-Reservierung blockiert keinen Feldspieler-Trainer', () => {
    const c = ctx({
      customers: [customer(), customer({ id: 'p2', full_name: 'Lena Lang' })],
      slotReservations: [reservation({ program: 'torhueter_individual' })],
    });
    expect(validateBookingRules(c, req({ program: 'individual' }), NOW)).toBeNull();
  });

  // Wer eine bestehende Gruppe auffuellt, nimmt dem Stammplatz keinen Trainer weg.
  test('Auffuellen einer laufenden Gruppe bleibt erlaubt', () => {
    const c = twoTrainers({
      customers: [
        customer({ can_book_gruppe: true }),
        customer({ id: 'p2', full_name: 'Lena Lang' }),
      ],
      slotReservations: [reservation()],
      allAppointments: [{
        id: 'a1', player_id: 'p9', date: '2026-06-15', time: '16:00', status: 'confirmed',
        program: 'gruppe', trainer_id: 't1', location: 'Rüsselsheim',
        session_birth_year: 2014, session_level: 'amateur',
      } as AdminAppointment],
    });
    expect(validateBookingRules(c, req({ program: 'gruppe', trainerId: 't1' }), NOW)).toBeNull();
  });
});
