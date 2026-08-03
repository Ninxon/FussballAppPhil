import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { CustomerProfile, MutationResult } from '../../hooks/useAdminData';
import { PlayerLevel, LEVEL_COLORS, LEVEL_LABELS } from '../../../types';
import { styles } from './styles';

const LEVELS: PlayerLevel[] = ['anfaenger', 'amateur', 'profi', 'experte'];

interface Props {
  customer: CustomerProfile;
  onSaveLevel: (customerId: string, level: PlayerLevel | null) => Promise<MutationResult>;
}

// Qualitätsstufe: erneutes Tippen auf die aktive Stufe entfernt sie.
export function LevelSection({ customer, onSaveLevel }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSetLevel = async (level: PlayerLevel | null) => {
    setLoading(true);
    setError(null);
    const { error: err } = await onSaveLevel(customer.id, level);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Qualitätsstufe</Text>
      <View style={styles.levelRow}>
        {LEVELS.map(level => {
          const isActive = customer.level === level;
          const color = LEVEL_COLORS[level];
          return (
            <TouchableOpacity
              key={level}
              style={[styles.levelChip, { borderColor: color, backgroundColor: isActive ? color : color + '15' }]}
              onPress={() => doSetLevel(isActive ? null : level)}
              activeOpacity={0.7}
              disabled={loading}
            >
              <Text style={[styles.levelChipText, { color: isActive ? '#fff' : color }]}>
                {LEVEL_LABELS[level]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!customer.level && <Text style={styles.noLevel}>Keine Qualitätsstufe zugewiesen</Text>}
      {error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}
