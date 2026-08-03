import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { VideoStorageUsage } from '../../../types';
import { formatBytes, storageLevel, STORAGE_QUOTA_BYTES } from '../../services/videoValidation';
import { C } from './theme';
import { styles } from './styles';

interface Props {
  usage: VideoStorageUsage | null;
  onCleanupOrphans: () => Promise<{ error: string | null; removed?: number }>;
}

const LEVEL_COLOR = { ok: C.success, warn: C.warn, critical: C.danger } as const;

// Zeigt die Belegung des Video-Buckets und bietet an, verwaiste Dateien zu
// entfernen (Altlasten abgebrochener Uploads und der Edge Function
// delete-trainer, die nur DB-Zeilen loescht).
export function StorageMeter({ usage, onCleanupOrphans }: Props) {
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<number | null>(null);

  if (!usage) return null;

  const level = storageLevel(usage.total_bytes);
  const share = Math.min(100, (usage.total_bytes / STORAGE_QUOTA_BYTES) * 100);

  const doCleanup = async () => {
    setCleaning(true);
    setError(null);
    setRemoved(null);
    const res = await onCleanupOrphans();
    setCleaning(false);
    if (res.error) setError(res.error);
    else setRemoved(res.removed ?? 0);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Speicherbelegung</Text>
      <View style={styles.meterHead}>
        <Text style={styles.meterValue}>
          {formatBytes(usage.total_bytes)} von {formatBytes(STORAGE_QUOTA_BYTES)}
        </Text>
        <Text style={styles.meterFiles}>
          {usage.file_count} {usage.file_count === 1 ? 'Datei' : 'Dateien'}
        </Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${Math.max(share, 1)}%`, backgroundColor: LEVEL_COLOR[level] }]} />
      </View>
      {level === 'warn' && (
        <Text style={styles.hint}>Über 70 % belegt — beim Hochladen auf die Dateigröße achten.</Text>
      )}
      {level === 'critical' && (
        <Text style={[styles.hint, { color: C.danger, fontWeight: '600' }]}>
          Über 90 % belegt. Nicht mehr benötigte Videos löschen oder Speicher im Supabase-Tarif erhöhen.
        </Text>
      )}

      {usage.orphan_count > 0 && (
        <View style={styles.meterOrphan}>
          <Text style={styles.meterOrphanText}>
            {usage.orphan_count} {usage.orphan_count === 1 ? 'verwaiste Datei' : 'verwaiste Dateien'} ohne
            Bibliothekseintrag ({formatBytes(usage.orphan_bytes)}).
          </Text>
          <TouchableOpacity
            style={[styles.ghostBtn, cleaning && { opacity: 0.6 }]}
            onPress={doCleanup}
            disabled={cleaning}
            activeOpacity={0.7}
          >
            <Text style={styles.ghostBtnText}>{cleaning ? 'Wird bereinigt…' : 'Bereinigen'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {removed !== null && (
        <Text style={styles.successText}>
          {removed === 0 ? 'Keine verwaisten Dateien gefunden.' : `${removed} Datei(en) entfernt.`}
        </Text>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}
