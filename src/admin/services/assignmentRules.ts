// Reine Regeln der Paket-Verteilung. Bewusst ohne supabase-Import, damit die
// Logik im Node-Testprojekt laufen kann (gleiches Motiv wie videoValidation.ts).

import { PackageAssignment } from '../../types';

/**
 * Was muss geschrieben werden, um von `current` auf `next` zu kommen?
 *
 * Neue UND zeitgeaenderte Zuweisungen landen zusammen in `toUpsert`: die
 * Zieltabelle hat den Primaerschluessel (package_id, trainer_id), ein Upsert
 * deckt damit beide Faelle in einem Statement ab. Reihenfolge spielt keine
 * Rolle — PostgREST garantiert sie ohnehin nicht.
 */
export function diffAssignments(
  current: PackageAssignment[],
  next: PackageAssignment[],
): { toUpsert: PackageAssignment[]; toRemove: string[] } {
  const cur = new Map(current.map(a => [a.trainerId, a.scheduledTime ?? null]));

  const toUpsert = next.filter(
    n => !cur.has(n.trainerId) || cur.get(n.trainerId) !== (n.scheduledTime ?? null),
  );

  const nextIds = new Set(next.map(n => n.trainerId));
  const toRemove = current.filter(c => !nextIds.has(c.trainerId)).map(c => c.trainerId);

  return { toUpsert, toRemove };
}
