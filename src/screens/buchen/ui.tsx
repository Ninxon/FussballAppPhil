import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { FadeIn } from '../../components/FadeIn';

// Gemeinsame Klein-Komponenten der Buchungs-Steps.

// Schritt-Einblendung; remountet pro Step (key), daher genügt die geteilte FadeIn.
export function FadeUp({ children }: { children: React.ReactNode }) {
  return <FadeIn duration={320}>{children}</FadeIn>;
}

export function BackBtn({ onPress }: { onPress: () => void }) {
  const { C } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20, alignSelf: 'flex-start' }}
      activeOpacity={0.7}
    >
      <Text style={{ fontSize: 20, color: C.accent, fontWeight: '600' }}>‹</Text>
      <Text style={{ fontSize: 15, fontWeight: '600', color: C.accent }}>Zurück</Text>
    </TouchableOpacity>
  );
}

export function SectionTitle({ t, sub }: { t: string; sub?: string }) {
  const { C } = useTheme();
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.3 }}>{t}</Text>
      {sub && <Text style={{ fontSize: 15, color: C.textFaint, marginTop: 4 }}>{sub}</Text>}
    </View>
  );
}

export function FilterChip({ label, active, color, onPress }: { label: string; active: boolean; color?: string; onPress: () => void }) {
  const { C } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1.5,
        borderColor: active ? (color ?? C.accent) : C.cardBorder,
        backgroundColor: active ? (color ?? C.accent) : C.card,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : C.textMid }}>{label}</Text>
    </TouchableOpacity>
  );
}
