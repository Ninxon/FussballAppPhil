import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { PlayerType } from '../../types';

export const PLAYER_TYPE_OPTIONS: { id: PlayerType; label: string }[] = [
  { id: 'feldspieler', label: 'Feldspieler' },
  { id: 'torwart', label: 'Torwart' },
];

interface Props {
  value: PlayerType | null;
  onSelect: (t: PlayerType) => void;
  /** true = kleinere Variante (KundenDetail-Bearbeitung). */
  compact?: boolean;
}

// Torwart/Feldspieler-Auswahl mit T/F-Avatar (KundenScreen-Formular + KundenDetail).
export function PlayerTypeChips({ value, onSelect, compact = false }: Props) {
  const s = compact ? compactStyles : regularStyles;

  return (
    <View style={s.typeRow}>
      {PLAYER_TYPE_OPTIONS.map(opt => (
        <TouchableOpacity
          key={opt.id}
          style={[s.typeChip, value === opt.id && shared.typeChipActive]}
          onPress={() => onSelect(opt.id)}
          activeOpacity={0.7}
        >
          <View style={[
            s.typeChipAvatar,
            { backgroundColor: opt.id === 'torwart' ? 'rgba(155,89,182,0.15)' : 'rgba(74,143,232,0.15)' },
          ]}>
            <Text style={[
              s.typeChipAvatarText,
              { color: opt.id === 'torwart' ? '#9B59B6' : '#4A8FE8' },
            ]}>
              {opt.id === 'torwart' ? 'T' : 'F'}
            </Text>
          </View>
          <Text style={[s.typeChipText, value === opt.id && shared.typeChipTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const shared = StyleSheet.create({
  typeChipActive: { borderColor: '#4A8FE8', backgroundColor: 'rgba(74,143,232,0.08)' },
  typeChipTextActive: { color: '#4A8FE8' },
});

const regularStyles = StyleSheet.create({
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  typeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(21,34,56,0.08)', backgroundColor: '#F4F8FF',
  },
  typeChipAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  typeChipAvatarText: { fontSize: 13, fontWeight: '800' },
  typeChipText: { fontSize: 14, fontWeight: '700', color: '#4A6080' },
});

const compactStyles = StyleSheet.create({
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  typeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(21,34,56,0.08)', backgroundColor: '#F4F8FF',
  },
  typeChipAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  typeChipAvatarText: { fontSize: 12, fontWeight: '800' },
  typeChipText: { fontSize: 13, fontWeight: '700', color: '#4A6080' },
});
