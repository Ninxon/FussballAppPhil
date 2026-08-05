import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TrainerProfile } from '../../hooks/useAdminData';
import { PackageAssignment } from '../../../types';
import { SLOTS } from '../../../constants/slots';
import { styles } from './styles';

interface Props {
  trainers: TrainerProfile[];
  /** Ist-Zustand der Verteilung. */
  assigned: PackageAssignment[];
  onSave: (assignments: PackageAssignment[]) => Promise<{ error: string | null }>;
}

/** Schluessel vorhanden = zugewiesen; Wert = gewaehlte Uhrzeit (null = keine). */
type Draft = Record<string, string | null>;

const toDraft = (assigned: PackageAssignment[]): Draft =>
  Object.fromEntries(assigned.map(a => [a.trainerId, a.scheduledTime]));

// Verteilung eines Pakets. Bewusst getrennt vom Paketinhalt: Haken setzen
// oder entfernen aendert nur den Zugriff, niemals Paket oder Videos.
//
// Die Uhrzeit haengt an der einzelnen Zuweisung: dasselbe Paket kann bei zwei
// Trainern zu verschiedenen Zeiten laufen. Gewaehlt wird aus SLOTS — denselben
// festen Zeiten, aus denen auch Termine gebucht werden. Damit gibt es nichts
// zu parsen und nichts zu validieren.
export function TrainerAssignPanel({ trainers, assigned, onSave }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(assigned));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Beim Paketwechsel den Ist-Zustand uebernehmen. Die Signatur wird sortiert,
  // weil PostgREST keine Reihenfolge garantiert — unsortiert feuerte der
  // Effect bei unveraendertem Inhalt erneut und verwuerfe die Eingabe.
  const sig = assigned
    .map(a => `${a.trainerId}@${a.scheduledTime ?? ''}`)
    .sort()
    .join('|');

  useEffect(() => { setDraft(toDraft(assigned)); setSaved(false); setError(null); },
    [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => {
    setSaved(false);
    setDraft(prev => {
      const next = { ...prev };
      if (id in next) delete next[id]; else next[id] = null;
      return next;
    });
  };

  const setTime = (id: string, time: string | null) => {
    setSaved(false);
    setDraft(prev => (id in prev ? { ...prev, [id]: time } : prev));
  };

  const ids = Object.keys(draft);
  const dirty = ids.length !== assigned.length
    || assigned.some(a => !(a.trainerId in draft) || draft[a.trainerId] !== a.scheduledTime);

  const doSave = async () => {
    setBusy(true);
    setError(null);
    const res = await onSave(ids.map(trainerId => ({ trainerId, scheduledTime: draft[trainerId] })));
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setSaved(true);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Verteilung</Text>
      <Text style={styles.cardHint}>
        Wer dieses Paket sehen soll. Ein entfernter Haken nimmt nur den Zugriff — Paket und
        Videos bleiben erhalten und können jederzeit erneut verteilt werden. Die Uhrzeit ist
        optional und gilt nur für den jeweiligen Trainer.
      </Text>

      {trainers.length === 0 ? (
        <Text style={styles.emptyHint}>Noch keine Trainer angelegt.</Text>
      ) : (
        trainers.map(t => {
          const on = t.id in draft;
          return (
            <View key={t.id} style={styles.trainerRow}>
              <TouchableOpacity
                style={styles.trainerRowMain}
                onPress={() => toggle(t.id)}
                activeOpacity={0.75}
              >
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
                <Text style={styles.trainerName}>{t.full_name}</Text>
                {t.trainer_specialty && (
                  <Text style={styles.trainerSpec}>
                    {t.trainer_specialty === 'torwart' ? 'Torwart' : 'Spieler'}
                  </Text>
                )}
              </TouchableOpacity>

              {on && (
                <View style={styles.slotRowInline}>
                  {[null, ...SLOTS].map(slot => {
                    const active = draft[t.id] === slot;
                    return (
                      <TouchableOpacity
                        key={slot ?? 'keine'}
                        style={[styles.slotChip, active && styles.slotChipActive]}
                        onPress={() => setTime(t.id, slot)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.slotChipText, active && styles.slotChipTextActive]}>
                          {slot ?? 'ohne Uhrzeit'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
      {saved && !dirty && <Text style={styles.successText}>✓ Verteilung gespeichert.</Text>}

      {dirty && (
        <TouchableOpacity
          style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
          onPress={doSave}
          disabled={busy}
          activeOpacity={0.7}
        >
          <Text style={styles.primaryBtnText}>
            {busy ? 'Wird gespeichert…' : `Verteilung speichern (${ids.length})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
