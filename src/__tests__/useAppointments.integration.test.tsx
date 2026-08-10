import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useAppointments } from '../hooks/useAppointments';
import { supabase } from '../lib/supabase';
import type { Player } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockUnsubscribe = jest.fn();

const SESSION = { user: { id: 'parent-1', email: 'max@example.com' } };

// Aktives Kind: id = player_id (= Schluessel fuer Termine/Tokens/Realtime).
const basePlayer: Player = {
  id: 'user-1',
  parent_id: 'parent-1',
  name: 'Max Mustermann',
  birth_date: '2000-01-01',
  level: 'amateur',
  player_type: 'feldspieler',
  location: 'Rüsselsheim',
  player_number: 101,
  is_active: true,
  skip_group_age_level_check: false,
  can_book_individual: true,
  can_book_gruppe: true,
  can_book_athletik: false,
  can_book_torhueter_individual: false,
  can_book_torhueter_gruppe: false,
};

const confirmedAppt = (overrides: Record<string, unknown> = {}) => ({
  id: 'appt-1',
  player_id: 'user-1',
  date: '2099-07-01',
  time: '10:00',
  status: 'confirmed' as const,
  program: 'individual',
  created_at: '2024-06-01T08:00:00Z',
  ...overrides,
});

const validToken = (overrides: Record<string, unknown> = {}) => ({
  id: 'tok-1',
  player_id: 'user-1',
  category: 'individual',
  issued_at: '2024-06-01T00:00:00Z',
  expires_at: '2099-12-31T00:00:00Z',
  used_at: null,
  source_appointment_id: 'appt-old',
  ...overrides,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFromChain(overrides: Record<string, jest.Mock> = {}) {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    then: jest.fn((cb: (v: any) => any) => Promise.resolve(cb({ data: [], error: null }))),
    ...overrides,
  };
  return chain;
}

function captureAuthCallback() {
  let captured: (event: string, session: any) => void = () => {};
  (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation((cb: any) => {
    captured = cb;
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  });
  return (event: string, session: any) => captured(event, session);
}

// Captures Realtime handlers (.on('postgres_changes', { event: ... }, handler))
function makeRealtimeCapture() {
  const handlers: Record<string, (payload: any) => void> = {};
  const channelMock = {
    on: jest.fn().mockImplementation(
      (_type: string, filter: { event: string }, cb: (payload: any) => void) => {
        handlers[filter.event] = cb;
        return channelMock;
      },
    ),
    subscribe: jest.fn().mockReturnThis(),
  };
  return { channelMock, handlers };
}

// Renders the hook and waits for initial data load.
// Does NOT touch supabase.rpc — set that up before calling this function
// if you need specific RPC behavior (including pre-seeded slot counts).
async function loadHookWithState(
  appointments: any[],
  tokens: any[],
  player: Player = basePlayer,
) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'appointments') {
      return makeFromChain({
        then: jest.fn((cb: (v: any) => any) => Promise.resolve(cb({ data: appointments, error: null }))),
      });
    }
    return makeFromChain({
      then: jest.fn((cb: (v: any) => any) => Promise.resolve(cb({ data: tokens, error: null }))),
    });
  });

  const triggerAuth = captureAuthCallback();
  const hook = renderHook(() => useAppointments(player));

  await act(async () => {
    triggerAuth('INITIAL_SESSION', SESSION);
    await new Promise(r => setTimeout(r, 20));
  });

  return hook;
}

// ── Global beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (supabase.channel as jest.Mock).mockReturnValue({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
  });
  (supabase.removeChannel as jest.Mock).mockResolvedValue(undefined);
  (supabase.auth.onAuthStateChange as jest.Mock).mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  });
  (supabase.auth as any).getSession = jest.fn().mockResolvedValue({
    data: { session: { user: SESSION.user } },
  });
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
  (supabase.from as jest.Mock).mockReturnValue(makeFromChain());
});

// ─────────────────────────────────────────────────────────────────────────────
// addAppointment — Fehlerfälle
// ─────────────────────────────────────────────────────────────────────────────

describe('addAppointment — Fehlerfälle', () => {
  it('kein aktiver Token vorhanden → Fehler ohne RPC-Aufruf', async () => {
    const { result } = await loadHookWithState([], []);

    let r: any;
    await act(async () => { r = await result.current.addAppointment('2099-07-01', '10:00', 'individual', 'Rüsselsheim'); });

    expect(r.error?.message).toMatch(/Stornierungstoken/);
    const rpcCalls = (supabase.rpc as jest.Mock).mock.calls.filter(c => c[0] === 'book_with_token');
    expect(rpcCalls).toHaveLength(0);
  });

  it('Token vorhanden, aber falsche Kategorie (gruppe-Token für individual-Slot) → Fehler', async () => {
    const gruppeToken = validToken({ category: 'gruppe' });
    const { result } = await loadHookWithState([], [gruppeToken]);

    let r: any;
    await act(async () => { r = await result.current.addAppointment('2099-07-01', '10:00', 'individual', 'Rüsselsheim'); });

    expect(r.error?.message).toMatch(/Stornierungstoken/);
  });

  it('Token abgelaufen (expires_at in Vergangenheit) → Fehler', async () => {
    const expiredToken = validToken({ expires_at: '2020-01-01T00:00:00Z' });
    const { result } = await loadHookWithState([], [expiredToken]);

    let r: any;
    // Datum ist nach expires_at → Client-seitiger Guard schlägt an
    await act(async () => { r = await result.current.addAppointment('2021-06-01', '10:00', 'individual', 'Rüsselsheim'); });

    expect(r.error?.message).toBeTruthy();
    const rpcCalls = (supabase.rpc as jest.Mock).mock.calls.filter(c => c[0] === 'book_with_token');
    expect(rpcCalls).toHaveLength(0);
  });

  it('Buchungsberechtigung für Programm fehlt → Fehler ohne RPC-Aufruf', async () => {
    const token = validToken();
    const restricted = { ...basePlayer, can_book_individual: false };
    const { result } = await loadHookWithState([], [token], restricted);

    let r: any;
    await act(async () => { r = await result.current.addAppointment('2099-07-01', '10:00', 'individual', 'Rüsselsheim'); });

    expect(r.error?.message).toBeTruthy();
    const rpcCalls = (supabase.rpc as jest.Mock).mock.calls.filter(c => c[0] === 'book_with_token');
    expect(rpcCalls).toHaveLength(0);
  });

  it('Tageslimit: 2 bestätigte Termine am selben Tag → Fehler ohne RPC-Aufruf', async () => {
    const token = validToken();
    const existing = [
      confirmedAppt({ id: 'a1', time: '09:00' }),
      confirmedAppt({ id: 'a2', time: '11:00' }),
    ];
    const { result } = await loadHookWithState(existing, [token]);

    let r: any;
    await act(async () => { r = await result.current.addAppointment('2099-07-01', '15:00', 'individual', 'Rüsselsheim'); });

    expect(r.error?.message).toBeTruthy();
    const rpcCalls = (supabase.rpc as jest.Mock).mock.calls.filter(c => c[0] === 'book_with_token');
    expect(rpcCalls).toHaveLength(0);
  });

  it('dritter Termin an anderem Tag ist erlaubt (Tageslimit gilt pro Tag)', async () => {
    const token = validToken();
    const existing = [
      confirmedAppt({ id: 'a1', date: '2099-07-01', time: '09:00' }),
      confirmedAppt({ id: 'a2', date: '2099-07-01', time: '11:00' }),
    ];
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'book_with_token') return Promise.resolve({ data: { appointment: confirmedAppt({ id: 'a3', date: '2099-07-02' }) }, error: null });
      return Promise.resolve({ data: [], error: null });
    });

    const { result } = await loadHookWithState(existing, [token]);

    let r: any;
    await act(async () => { r = await result.current.addAppointment('2099-07-02', '10:00', 'individual', 'Rüsselsheim'); });

    expect(r.error).toBeNull();
  });

  it('kein aktives Kind → Fehler ohne RPC-Aufruf', async () => {
    (supabase.auth as any).getSession = jest.fn().mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useAppointments(null));

    let r: any;
    await act(async () => { r = await result.current.addAppointment('2099-07-01', '10:00', 'individual', 'Rüsselsheim'); });

    expect(r.error?.message).toMatch(/Spieler/);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('DB-RPC gibt Netzwerkfehler zurück → Fehler', async () => {
    const token = validToken();
    const { result } = await loadHookWithState([], [token]);

    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'Verbindungsfehler' } });

    let r: any;
    await act(async () => { r = await result.current.addAppointment('2099-07-01', '10:00', 'individual', 'Rüsselsheim'); });

    expect(r.error).toBeTruthy();
  });

  it('DB-RPC gibt error im Ergebnisobjekt zurück → Fehler', async () => {
    const token = validToken();
    const { result } = await loadHookWithState([], [token]);

    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { error: 'Token nicht gefunden oder abgelaufen.' },
      error: null,
    });

    let r: any;
    await act(async () => { r = await result.current.addAppointment('2099-07-01', '10:00', 'individual', 'Rüsselsheim'); });

    expect(r.error?.message).toMatch(/Token nicht gefunden/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addAppointment — Erfolgspfad
// ─────────────────────────────────────────────────────────────────────────────

describe('addAppointment — Erfolgspfad', () => {
  const bookedAppt = confirmedAppt({ id: 'new-appt-1' });

  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'book_with_token') return Promise.resolve({ data: { appointment: bookedAppt }, error: null });
      return Promise.resolve({ data: [], error: null });
    });
  });

  it('myAppointments enthält neuen Termin nach Buchung', async () => {
    const token = validToken();
    const { result } = await loadHookWithState([], [token]);

    await act(async () => { await result.current.addAppointment('2099-07-01', '10:00', 'individual', 'Rüsselsheim'); });

    expect(result.current.myAppointments).toHaveLength(1);
    expect(result.current.myAppointments[0].id).toBe('new-appt-1');
  });

  it('verwendeter Token wird aus activeTokens entfernt', async () => {
    const token = validToken();
    const { result } = await loadHookWithState([], [token]);

    await act(async () => { await result.current.addAppointment('2099-07-01', '10:00', 'individual', 'Rüsselsheim'); });

    expect(result.current.activeTokens).toHaveLength(0);
  });

  it('slotCounts wird für den gebuchten Slot um 1 erhöht', async () => {
    const token = validToken();
    const { result } = await loadHookWithState([], [token]);

    await act(async () => { await result.current.addAppointment('2099-07-01', '10:00', 'individual', 'Rüsselsheim'); });

    const slot = result.current.slotCounts.find(
      s => s.date === '2099-07-01' && s.time === '10:00' && s.program === 'individual',
    );
    expect(slot?.booked).toBe(1);
  });

  it('book_with_token RPC wird mit korrekten Parametern aufgerufen', async () => {
    const token = validToken({ id: 'tok-spec' });
    const { result } = await loadHookWithState([], [token]);

    await act(async () => { await result.current.addAppointment('2099-07-01', '10:00', 'individual', 'Rüsselsheim'); });

    expect(supabase.rpc).toHaveBeenCalledWith('book_with_token', {
      p_player_id: 'user-1',
      p_token_id: 'tok-spec',
      p_date: '2099-07-01',
      p_time: '10:00',
      p_program: 'individual',
      // Der Standort des gewaehlten Slots muss durchgereicht werden. Frueher kam
      // hier null an, weil App.tsx den vierten Parameter verschluckt hat — und
      // Termine ohne Standort waren fuer die Gruppenpruefung unsichtbar.
      p_location: 'Rüsselsheim',
    });
  });

  it('ohne Standort wird gar nicht gebucht', async () => {
    const { result } = await loadHookWithState([], [validToken()]);
    let r: any;
    await act(async () => { r = await result.current.addAppointment('2099-07-01', '10:00', 'individual', null as any); });
    expect(r.error?.message).toMatch(/Standort/);
    expect((supabase.rpc as jest.Mock).mock.calls.filter(c => c[0] === 'book_with_token')).toHaveLength(0);
  });

  it('bei zwei Tokens (individual + gruppe) wird der passende kategorie-Token verwendet', async () => {
    const individualToken = validToken({ id: 'tok-i', category: 'individual' });
    const gruppeToken = validToken({ id: 'tok-g', category: 'gruppe' });

    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'book_with_token') {
        return Promise.resolve({ data: { appointment: confirmedAppt({ id: 'new-g', program: 'gruppe' }) }, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const { result } = await loadHookWithState([], [individualToken, gruppeToken]);

    await act(async () => { await result.current.addAppointment('2099-07-01', '10:00', 'gruppe', 'Rüsselsheim'); });

    expect(supabase.rpc).toHaveBeenCalledWith('book_with_token', expect.objectContaining({
      p_token_id: 'tok-g',
    }));
    // Der individual Token bleibt erhalten
    expect(result.current.activeTokens).toHaveLength(1);
    expect(result.current.activeTokens[0].id).toBe('tok-i');
  });

  it('athletik-Programm verwendet gruppe-Token (Kategorie gruppe)', async () => {
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'book_with_token') {
        return Promise.resolve({ data: { appointment: confirmedAppt({ id: 'new-a', program: 'athletik' }) }, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const gruppeToken = validToken({ id: 'tok-g', category: 'gruppe' });
    const athletikProfile = { ...basePlayer, can_book_athletik: true };
    const { result } = await loadHookWithState([], [gruppeToken], athletikProfile);

    let r: any;
    await act(async () => { r = await result.current.addAppointment('2099-07-01', '10:00', 'athletik', 'Rüsselsheim'); });

    expect(r.error).toBeNull();
    expect(supabase.rpc).toHaveBeenCalledWith('book_with_token', expect.objectContaining({
      p_token_id: 'tok-g',
      p_program: 'athletik',
    }));
  });

  it('Rückgabe error: null bei Erfolg', async () => {
    const token = validToken();
    const { result } = await loadHookWithState([], [token]);

    let r: any;
    await act(async () => { r = await result.current.addAppointment('2099-07-01', '10:00', 'individual', 'Rüsselsheim'); });

    expect(r.error).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addAppointment — Race Condition Guard (optimistisch + Realtime)
// ─────────────────────────────────────────────────────────────────────────────

describe('addAppointment — Race Condition Guard', () => {
  it('Realtime INSERT nach optimistischem Update erhöht slotCounts NICHT nochmal', async () => {
    const newAppt = confirmedAppt({ id: 'race-1' });
    const { channelMock, handlers } = makeRealtimeCapture();
    (supabase.channel as jest.Mock).mockReturnValue(channelMock);

    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'book_with_token') return Promise.resolve({ data: { appointment: newAppt }, error: null });
      return Promise.resolve({ data: [], error: null });
    });

    const token = validToken();
    const { result } = await loadHookWithState([], [token]);

    await act(async () => { await result.current.addAppointment('2099-07-01', '10:00', 'individual', 'Rüsselsheim'); });

    // slotCounts nach optimistischem Update: 1
    const afterOptimistic = result.current.slotCounts.find(
      s => s.date === '2099-07-01' && s.time === '10:00' && s.program === 'individual',
    );
    expect(afterOptimistic?.booked).toBe(1);

    // Realtime INSERT mit derselben Appointment-ID
    await act(async () => { handlers['INSERT']?.({ new: newAppt }); });

    // Muss immer noch 1 sein, nicht 2
    const afterRealtime = result.current.slotCounts.find(
      s => s.date === '2099-07-01' && s.time === '10:00' && s.program === 'individual',
    );
    expect(afterRealtime?.booked).toBe(1);
  });

  it('Realtime INSERT mit anderer ID (fremde Buchung) erhöht slotCounts korrekt', async () => {
    const { channelMock, handlers } = makeRealtimeCapture();
    (supabase.channel as jest.Mock).mockReturnValue(channelMock);

    const { result } = await loadHookWithState([], []);

    // Fremder User bucht denselben Slot
    await act(async () => {
      handlers['INSERT']?.({
        new: {
          id: 'other-appt',
          player_id: 'other-user',
          date: '2099-07-01',
          time: '10:00',
          program: 'gruppe',
          status: 'confirmed',
          created_at: new Date().toISOString(),
        },
      });
    });

    const slot = result.current.slotCounts.find(
      s => s.date === '2099-07-01' && s.time === '10:00' && s.program === 'gruppe',
    );
    expect(slot?.booked).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cancelAppointment — Fehlerfälle
// ─────────────────────────────────────────────────────────────────────────────

describe('cancelAppointment — Fehlerfälle', () => {
  it('DB-Netzwerkfehler wird weitergegeben', async () => {
    const appt = confirmedAppt();
    const { result } = await loadHookWithState([appt], []);

    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'Verbindungsfehler' } });

    let r: any;
    await act(async () => { r = await result.current.cancelAppointment('appt-1'); });

    expect(r.error?.message).toBe('Verbindungsfehler');
    // myAppointments bleibt unverändert (confirmed)
    expect(result.current.myAppointments[0].status).toBe('confirmed');
  });

  it('DB gibt error-Objekt im Ergebnis zurück → Fehler', async () => {
    const appt = confirmedAppt();
    const { result } = await loadHookWithState([appt], []);

    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { error: 'Termin nicht gefunden.' },
      error: null,
    });

    let r: any;
    await act(async () => { r = await result.current.cancelAppointment('appt-1'); });

    expect(r.error?.message).toBe('Termin nicht gefunden.');
    expect(result.current.myAppointments[0].status).toBe('confirmed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cancelAppointment — Erfolgspfad
// ─────────────────────────────────────────────────────────────────────────────

describe('cancelAppointment — Erfolgspfad', () => {
  const cancelToken = validToken();

  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'cancel_and_issue_token') {
        return Promise.resolve({
          data: { appointment_id: 'appt-1', token: cancelToken },
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });
  });

  it('cancel_and_issue_token RPC wird mit p_appointment_id und p_skip_token aufgerufen', async () => {
    const appt = confirmedAppt();
    const { result } = await loadHookWithState([appt], []);

    await act(async () => { await result.current.cancelAppointment('appt-1', false); });

    expect(supabase.rpc).toHaveBeenCalledWith('cancel_and_issue_token', {
      p_appointment_id: 'appt-1',
      p_skip_token: false,
    });
  });

  it('myAppointments status wechselt zu cancelled', async () => {
    const appt = confirmedAppt();
    const { result } = await loadHookWithState([appt], []);

    await act(async () => { await result.current.cancelAppointment('appt-1'); });

    expect(result.current.myAppointments[0].status).toBe('cancelled');
  });

  it('slotCounts wird für den stornierten Slot dekrementiert', async () => {
    const appt = confirmedAppt();
    const initialSlots = [{ date: '2099-07-01', time: '10:00', program: 'individual', booked: 1 }];
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'get_slot_counts') return Promise.resolve({ data: initialSlots, error: null });
      if (name === 'cancel_and_issue_token') return Promise.resolve({ data: { appointment_id: 'appt-1', token: cancelToken }, error: null });
      return Promise.resolve({ data: [], error: null });
    });
    const { result } = await loadHookWithState([appt], []);

    await act(async () => { await result.current.cancelAppointment('appt-1'); });

    const slot = result.current.slotCounts.find(
      s => s.date === '2099-07-01' && s.time === '10:00' && s.program === 'individual',
    );
    expect(slot?.booked).toBe(0);
  });

  it('booked kann nicht unter 0 fallen', async () => {
    const appt = confirmedAppt();
    const initialSlots = [{ date: '2099-07-01', time: '10:00', program: 'individual', booked: 0 }];
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'get_slot_counts') return Promise.resolve({ data: initialSlots, error: null });
      if (name === 'cancel_and_issue_token') return Promise.resolve({ data: { appointment_id: 'appt-1', token: cancelToken }, error: null });
      return Promise.resolve({ data: [], error: null });
    });
    const { result } = await loadHookWithState([appt], []);

    await act(async () => { await result.current.cancelAppointment('appt-1'); });

    const slot = result.current.slotCounts.find(
      s => s.date === '2099-07-01' && s.time === '10:00' && s.program === 'individual',
    );
    expect(slot?.booked).toBe(0);
  });

  it('skipToken=false → Token wird zu activeTokens hinzugefügt', async () => {
    const appt = confirmedAppt();
    const { result } = await loadHookWithState([appt], []);

    await act(async () => { await result.current.cancelAppointment('appt-1', false); });

    expect(result.current.activeTokens).toHaveLength(1);
    expect(result.current.activeTokens[0].id).toBe('tok-1');
  });

  it('skipToken=true → kein Token in activeTokens, RPC mit p_skip_token: true', async () => {
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'cancel_and_issue_token') {
        return Promise.resolve({ data: { appointment_id: 'appt-1' }, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const appt = confirmedAppt();
    const { result } = await loadHookWithState([appt], []);

    await act(async () => { await result.current.cancelAppointment('appt-1', true); });

    expect(supabase.rpc).toHaveBeenCalledWith('cancel_and_issue_token', {
      p_appointment_id: 'appt-1',
      p_skip_token: true,
    });
    expect(result.current.activeTokens).toHaveLength(0);
  });

  it('Rückgabe error: null bei Erfolg', async () => {
    const appt = confirmedAppt();
    const { result } = await loadHookWithState([appt], []);

    let r: any;
    await act(async () => { r = await result.current.cancelAppointment('appt-1'); });

    expect(r.error).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cancelAppointment — Fehlerpfad (Anti-Regression: Fehler dürfen nicht
// verschluckt werden, damit die UI sie anzeigen kann)
// ─────────────────────────────────────────────────────────────────────────────

describe('cancelAppointment — Fehlerpfad', () => {
  it('Business-Fehler (z. B. Nachholtermin-Limit) wird als { error } zurückgegeben', async () => {
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'cancel_and_issue_token') {
        return Promise.resolve({
          data: { error: 'Dieser Nachholtermin kann nicht mehr storniert werden. Bitte wende dich an deinen Trainer.' },
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });
    const appt = confirmedAppt();
    const { result } = await loadHookWithState([appt], []);

    let r: any;
    await act(async () => { r = await result.current.cancelAppointment('appt-1'); });

    expect(r.error?.message).toMatch(/nicht mehr storniert/i);
    // Termin darf NICHT optimistisch als storniert markiert werden
    expect(result.current.myAppointments[0].status).toBe('confirmed');
  });

  it('Transport-Fehler der RPC wird propagiert', async () => {
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'cancel_and_issue_token') {
        return Promise.resolve({ data: null, error: { message: 'network down' } });
      }
      return Promise.resolve({ data: [], error: null });
    });
    const appt = confirmedAppt();
    const { result } = await loadHookWithState([appt], []);

    let r: any;
    await act(async () => { r = await result.current.cancelAppointment('appt-1'); });

    expect(r.error).toBeTruthy();
    expect(result.current.myAppointments[0].status).toBe('confirmed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cancelAppointment — Race Condition Guard
// ─────────────────────────────────────────────────────────────────────────────

describe('cancelAppointment — Race Condition Guard', () => {
  it('Realtime UPDATE nach optimistischer Stornierung dekrementiert slotCounts NICHT nochmal', async () => {
    const appt = confirmedAppt();
    const initialSlots = [{ date: '2099-07-01', time: '10:00', program: 'individual', booked: 1 }];

    const { channelMock, handlers } = makeRealtimeCapture();
    (supabase.channel as jest.Mock).mockReturnValue(channelMock);
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'get_slot_counts') return Promise.resolve({ data: initialSlots, error: null });
      if (name === 'cancel_and_issue_token') return Promise.resolve({ data: { appointment_id: 'appt-1', token: validToken() }, error: null });
      return Promise.resolve({ data: [], error: null });
    });

    const { result } = await loadHookWithState([appt], []);

    expect(result.current.slotCounts.find(s => s.date === '2099-07-01')?.booked).toBe(1);

    // Stornierung (optimistisches Decrement auf 0)
    await act(async () => { await result.current.cancelAppointment('appt-1'); });

    expect(result.current.slotCounts.find(s => s.date === '2099-07-01')?.booked).toBe(0);

    // Realtime UPDATE feuert mit status confirmed→cancelled (gleiche appt-ID)
    await act(async () => {
      handlers['UPDATE']?.({
        new: { ...appt, status: 'cancelled' },
        old: { ...appt, status: 'confirmed' },
      });
    });

    // Muss 0 bleiben, nicht −1 oder Math.max(0, −1) = 0 (wäre implizit maskiert)
    expect(result.current.slotCounts.find(s => s.date === '2099-07-01')?.booked).toBe(0);
  });

  it('Realtime UPDATE von fremdem Storno (andere appt-ID) wird korrekt verarbeitet', async () => {
    const initialSlots = [{ date: '2099-07-01', time: '10:00', program: 'gruppe', booked: 2 }];

    const { channelMock, handlers } = makeRealtimeCapture();
    (supabase.channel as jest.Mock).mockReturnValue(channelMock);
    // Must be set before loadHookWithState so get_slot_counts returns the seeded data
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
      if (name === 'get_slot_counts') return Promise.resolve({ data: initialSlots, error: null });
      return Promise.resolve({ data: [], error: null });
    });

    const { result } = await loadHookWithState([], []);

    expect(result.current.slotCounts.find(s => s.date === '2099-07-01')?.booked).toBe(2);

    // Fremder User storniert seinen Termin
    await act(async () => {
      handlers['UPDATE']?.({
        new: { id: 'other-appt', player_id: 'other-user', date: '2099-07-01', time: '10:00', program: 'gruppe', status: 'cancelled' },
        old: { id: 'other-appt', player_id: 'other-user', date: '2099-07-01', time: '10:00', program: 'gruppe', status: 'confirmed' },
      });
    });

    // Slot muss korrekt auf 1 dekrementiert werden
    expect(result.current.slotCounts.find(s => s.date === '2099-07-01')?.booked).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Initialer State & Session
// ─────────────────────────────────────────────────────────────────────────────

describe('useAppointments — initialer State', () => {
  it('leere Listen und loading=true beim Mounten', () => {
    const { result } = renderHook(() => useAppointments(null));
    expect(result.current.slotCounts).toEqual([]);
    expect(result.current.myAppointments).toEqual([]);
    expect(result.current.activeTokens).toEqual([]);
    expect(result.current.loading).toBe(true);
  });
});

describe('useAppointments — ohne Session', () => {
  it('loading=false mit leerem State wenn kein User', async () => {
    const triggerAuth = captureAuthCallback();
    const { result } = renderHook(() => useAppointments(null));

    await act(async () => {
      triggerAuth('INITIAL_SESSION', null);
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.slotCounts).toEqual([]);
    expect(result.current.myAppointments).toEqual([]);
  });
});

describe('useAppointments — Datenladen', () => {
  it('myAppointments und activeTokens werden nach Login befüllt', async () => {
    const appt = confirmedAppt();
    const token = validToken();
    const { result } = await loadHookWithState([appt], [token]);

    expect(result.current.myAppointments).toHaveLength(1);
    expect(result.current.myAppointments[0].id).toBe('appt-1');
    expect(result.current.activeTokens).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  it('nur eigene Termine werden geladen (RLS filtert serverseitig)', async () => {
    const appt = confirmedAppt();
    const { result } = await loadHookWithState([appt], []);

    expect(result.current.myAppointments).toHaveLength(1);
    expect(result.current.myAppointments[0].player_id).toBe('user-1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe('useAppointments — Cleanup', () => {
  it('Channel-Unsubscribe und removeChannel beim Unmount', async () => {
    const triggerAuth = captureAuthCallback();
    const { unmount } = renderHook(() => useAppointments(null));

    await act(async () => {
      triggerAuth('INITIAL_SESSION', null);
      await Promise.resolve();
    });

    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(supabase.removeChannel).toHaveBeenCalled();
  });
});
