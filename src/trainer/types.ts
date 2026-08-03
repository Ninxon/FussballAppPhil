export type TrainerAppointment = {
  id: string;
  date: string;
  time: string;
  status: string;
  program: string;
  player_id: string;
  location: string | null;
  players: { name: string; level: string | null; player_type: string | null } | null;
};

export type SlotMember = { id: string; name: string; level: string | null };

export type TrainerSlot = {
  key: string;
  date: string;
  time: string;
  program: string;
  location: string | null;
  members: SlotMember[];
};

export type TrainerProfile = {
  full_name: string;
  email: string;
  trainer_specialty: string | null;
};

export type TrainerVideo = {
  id: string;
  title: string;
  url: string;
  description: string | null;
};

// Termine zu Slots bündeln: gleicher Tag + Uhrzeit + Programm + Standort = ein
// Slot. Gruppentrainings zeigen so alle Teilnehmer in einer Karte. Eingabe ist
// bereits nach date/time sortiert, deshalb bleibt die Reihenfolge chronologisch.
export function groupSlots(appts: TrainerAppointment[]): TrainerSlot[] {
  const map = new Map<string, TrainerSlot>();
  const order: string[] = [];
  for (const a of appts) {
    const key = `${a.date}|${a.time}|${a.program}|${a.location ?? ''}`;
    let slot = map.get(key);
    if (!slot) {
      slot = { key, date: a.date, time: a.time, program: a.program, location: a.location, members: [] };
      map.set(key, slot);
      order.push(key);
    }
    slot.members.push({ id: a.id, name: a.players?.name?.trim() || 'Unbekannt', level: a.players?.level ?? null });
  }
  return order.map(k => map.get(k)!);
}
