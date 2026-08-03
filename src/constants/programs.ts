export const PROGRAMS = [
  {
    id: 'individual',
    name: 'Individualtraining',
    description: 'Individuelle 1:1-Betreuung, bei der explizit die Schwächen und Stärken des Spielers gefunden und verbessert werden. Wir gehen individuell auf jeden Spieler ein und geben spezielle Tipps.',
    duration: 55,
    capacity: 1,
    category: 'individual' as const,
    color: '#4A8FE8',
  },
  {
    id: 'gruppe',
    name: 'Gruppentraining',
    description: 'Training bis zu 4 gleichstarken Spielern, bei dem spielnahe Situationen trainiert werden. Aufgrund der bewusst kleinen Gruppengröße gehen wir individuell auf jeden Spieler ein.',
    duration: 55,
    capacity: 4,
    category: 'gruppe' as const,
    color: '#3DBFA0',
  },
  {
    id: 'athletik',
    name: 'Athletiktraining',
    description: 'Gezieltes Konditions- und Athletiktraining zur Verbesserung von Schnelligkeit, Ausdauer und Koordination. Optimal als Ergänzung zum Balltraining.',
    duration: 55,
    capacity: 4,
    category: 'gruppe' as const,
    color: '#F5A84A',
  },
  {
    id: 'torhueter_individual',
    name: 'Torwart Individual',
    description: 'Individuelles 1:1-Torwarttraining mit speziell ausgebildeten Torwarttrainern. Fokus auf Technik, Stellungsspiel und Reaktion.',
    duration: 55,
    capacity: 1,
    category: 'individual' as const,
    color: '#E87676',
  },
  {
    id: 'torhueter_gruppe',
    name: 'Torwart Gruppe',
    description: 'Torwarttraining in der Gruppe mit max. 4 Teilnehmern. Gemeinsames Üben von Abwehraktionen und Spielaufbau unter Wettkampfbedingungen.',
    duration: 55,
    capacity: 4,
    category: 'gruppe' as const,
    color: '#9B59B6',
  },
] as const;

export type ProgramId = typeof PROGRAMS[number]['id'];
export type ProgramCategory = 'individual' | 'gruppe';

export const PROGRAM_CATEGORY: Record<ProgramId, ProgramCategory> = {
  individual: 'individual',
  torhueter_individual: 'individual',
  gruppe: 'gruppe',
  athletik: 'gruppe',
  torhueter_gruppe: 'gruppe',
};

export const PROGRAM_CAPACITY: Record<ProgramId, number> = {
  individual: 1,
  torhueter_individual: 1,
  gruppe: 4,
  athletik: 4,
  torhueter_gruppe: 4,
};

export const CATEGORY_COLORS: Record<ProgramCategory, string> = {
  individual: '#4A8FE8',
  gruppe: '#3DBFA0',
};

// Farbe je Programm, abgeleitet aus PROGRAMS (eine Quelle statt lokaler Kopien).
// Als Record<string, string>, weil `appointments.program` aus der DB als freier
// String kommt und direkt zum Indexieren verwendet wird.
export const PROGRAM_COLORS: Record<string, string> = Object.fromEntries(
  PROGRAMS.map(p => [p.id, p.color]),
);
