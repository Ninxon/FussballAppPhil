import { diffAssignments } from '../admin/services/assignmentRules';
import { PackageAssignment } from '../types';

const a = (trainerId: string, scheduledTime: string | null = null): PackageAssignment =>
  ({ trainerId, scheduledTime });

describe('diffAssignments', () => {
  it('erkennt eine neue Zuweisung', () => {
    const { toUpsert, toRemove } = diffAssignments([], [a('t1', '18:00')]);
    expect(toUpsert).toEqual([a('t1', '18:00')]);
    expect(toRemove).toEqual([]);
  });

  it('erkennt eine entfernte Zuweisung', () => {
    const { toUpsert, toRemove } = diffAssignments([a('t1', '18:00')], []);
    expect(toUpsert).toEqual([]);
    expect(toRemove).toEqual(['t1']);
  });

  // Der eigentliche Regressionsschutz: frueher gab es nur Insert und Delete.
  // Eine geaenderte Uhrzeit darf NICHT als "entfernen und neu anlegen"
  // durchlaufen, sonst ginge assigned_at verloren.
  it('schreibt eine geaenderte Uhrzeit als Upsert, nicht als Entfernen', () => {
    const { toUpsert, toRemove } = diffAssignments([a('t1', '18:00')], [a('t1', '19:00')]);
    expect(toUpsert).toEqual([a('t1', '19:00')]);
    expect(toRemove).toEqual([]);
  });

  it('behandelt das Loeschen einer Uhrzeit als Aenderung', () => {
    const { toUpsert, toRemove } = diffAssignments([a('t1', '18:00')], [a('t1', null)]);
    expect(toUpsert).toEqual([a('t1', null)]);
    expect(toRemove).toEqual([]);
  });

  it('erkennt das Setzen einer Uhrzeit auf einer bestehenden Zuweisung', () => {
    const { toUpsert } = diffAssignments([a('t1')], [a('t1', '13:00')]);
    expect(toUpsert).toEqual([a('t1', '13:00')]);
  });

  it('schreibt nichts, wenn sich nichts geaendert hat', () => {
    const same = [a('t1', '18:00'), a('t2')];
    const { toUpsert, toRemove } = diffAssignments(same, [...same]);
    expect(toUpsert).toEqual([]);
    expect(toRemove).toEqual([]);
  });

  // PostgREST garantiert keine Reihenfolge — dieselbe Menge in anderer
  // Reihenfolge darf keinen Schreibvorgang ausloesen.
  it('ist unabhaengig von der Reihenfolge', () => {
    const current = [a('t1', '18:00'), a('t2', '13:00')];
    const next = [a('t2', '13:00'), a('t1', '18:00')];
    const { toUpsert, toRemove } = diffAssignments(current, next);
    expect(toUpsert).toEqual([]);
    expect(toRemove).toEqual([]);
  });

  it('kombiniert Hinzufuegen, Aendern und Entfernen', () => {
    const current = [a('t1', '18:00'), a('t2', '13:00'), a('t3')];
    const next = [a('t1', '18:00'), a('t2', '14:00'), a('t4', '19:00')];
    const { toUpsert, toRemove } = diffAssignments(current, next);
    expect(toUpsert).toEqual([a('t2', '14:00'), a('t4', '19:00')]);
    expect(toRemove).toEqual(['t3']);
  });
});
