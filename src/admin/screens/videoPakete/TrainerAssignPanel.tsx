import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TrainerProfile } from '../../hooks/useAdminData';
import { styles } from './styles';

interface Props {
  trainers: TrainerProfile[];
  /** Ist-Zustand der Zuweisung. */
  assignedIds: string[];
  onSave: (trainerIds: string[]) => Promise<{ error: string | null }>;
}

// Verteilung eines Pakets. Bewusst getrennt vom Paketinhalt: Haken setzen
// oder entfernen aendert nur den Zugriff, niemals Paket oder Videos.
export function TrainerAssignPanel({ trainers, assignedIds, onSave }: Props) {
  const [selected, setSelected] = useState<string[]>(assignedIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Beim Paketwechsel den Ist-Zustand uebernehmen.
  useEffect(() => { setSelected(assignedIds); setSaved(false); setError(null); },
    [assignedIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => {
    setSaved(false);
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const dirty = selected.length !== assignedIds.length
    || selected.some(id => !assignedIds.includes(id));

  const doSave = async () => {
    setBusy(true);
    setError(null);
    const res = await onSave(selected);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setSaved(true);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Verteilung</Text>
      <Text style={styles.cardHint}>
        Wer dieses Paket sehen soll. Ein entfernter Haken nimmt nur den Zugriff — Paket und
        Videos bleiben erhalten und können jederzeit erneut verteilt werden.
      </Text>

      {trainers.length === 0 ? (
        <Text style={styles.emptyHint}>Noch keine Trainer angelegt.</Text>
      ) : (
        trainers.map(t => {
          const on = selected.includes(t.id);
          return (
            <TouchableOpacity
              key={t.id}
              style={styles.trainerRow}
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
            {busy ? 'Wird gespeichert…' : `Verteilung speichern (${selected.length})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
