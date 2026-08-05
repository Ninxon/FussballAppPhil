import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ConfirmBox } from './ConfirmBox';
import { styles } from './styles';

interface Props {
  totalAssignments: number;
  packagesWithAssignments: number;
  onReset: () => Promise<{ error: string | null; removed?: number }>;
}

// Globaler Reset der Verteilung. Bewusst hier unten und nicht in der
// Paket-Detailansicht: dort geht es um EIN Paket, ein globaler Schalter waere
// an dieser Stelle eine Falle.
export function ResetAssignmentsPanel({ totalAssignments, packagesWithAssignments, onReset }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<number | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await onReset();
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setConfirming(false);
    setRemoved(res.removed ?? 0);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Verteilung zurücksetzen</Text>
      <Text style={styles.cardHint}>
        Entfernt die Zuweisungen aller Pakete inklusive aller Uhrzeiten. Pakete, Videos und
        Dateien bleiben vollständig erhalten und können danach neu verteilt werden.
      </Text>

      {totalAssignments === 0 ? (
        <Text style={styles.emptyHint}>Aktuell ist kein Paket verteilt.</Text>
      ) : !confirming ? (
        <TouchableOpacity
          style={styles.dangerBtn}
          onPress={() => { setConfirming(true); setRemoved(null); setError(null); }}
          activeOpacity={0.7}
        >
          <Text style={styles.dangerBtnText}>Alle Verteilungen entfernen ({totalAssignments})</Text>
        </TouchableOpacity>
      ) : (
        <ConfirmBox
          title="Wirklich alle Verteilungen entfernen?"
          text={
            `${totalAssignments} ${totalAssignments === 1 ? 'Zuweisung' : 'Zuweisungen'} aus `
            + `${packagesWithAssignments} ${packagesWithAssignments === 1 ? 'Paket' : 'Paketen'} werden gelöscht. `
            + 'Die betroffenen Trainer sehen danach keine Video-Pakete mehr und die eingestellten '
            + 'Uhrzeiten sind weg. Pakete und Videos bleiben erhalten.'
          }
          confirmLabel="Ja, alle Verteilungen entfernen"
          loading={busy}
          error={error}
          onConfirm={run}
          onCancel={() => { setConfirming(false); setError(null); }}
        />
      )}

      {removed !== null && (
        <Text style={styles.successText}>
          ✓ {removed} {removed === 1 ? 'Verteilung' : 'Verteilungen'} entfernt.
        </Text>
      )}
      {error && !confirming && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}
