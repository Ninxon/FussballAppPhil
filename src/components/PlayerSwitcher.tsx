import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { Player } from '../types';

interface Props {
  players: Player[];
  activePlayerId: string | null;
  onSelect: (id: string) => void;
}

// Header-Umschalter fuer das aktive Kind. Bei nur einem Spieler ausgeblendet.
export function PlayerSwitcher({ players, activePlayerId, onSelect }: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);

  if (players.length <= 1) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {players.map(p => {
          const active = p.id === activePlayerId;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => onSelect(p.id)}
              activeOpacity={0.8}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {p.name?.trim().split(' ')[0] || 'Spieler'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    wrap: { marginBottom: 14 },
    row: { gap: 8, paddingRight: 8 },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: C.cardBorder,
      backgroundColor: C.card,
    },
    chipActive: {
      borderColor: C.accent,
      backgroundColor: C.accent,
    },
    chipText: { fontSize: 14, fontWeight: '700', color: C.textMid },
    chipTextActive: { color: '#fff' },
  });
}
