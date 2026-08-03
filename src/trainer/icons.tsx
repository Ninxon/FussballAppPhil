import React from 'react';
import { View } from 'react-native';

// Nav-Icons als View-Formen (statt Emojis) — Stil wie in src/components/BottomNav.tsx
export const NAV_ACTIVE = '#1C2133';
export const NAV_INACTIVE = '#9CA3AF';

export function CalendarIcon({ color, size = 22 }: { color: string; size?: number }) {
  const bw = Math.max(1.8, size * 0.09);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size * 0.92, borderWidth: bw, borderColor: color, borderRadius: size * 0.16, overflow: 'hidden' }}>
        <View style={{ height: size * 0.26, backgroundColor: color }} />
      </View>
    </View>
  );
}

export function VideoIcon({ color, size = 22 }: { color: string; size?: number }) {
  const bw = Math.max(1.8, size * 0.09);
  const t = size * 0.2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size * 0.74, borderWidth: bw, borderColor: color, borderRadius: size * 0.14, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 0, height: 0, borderTopWidth: t, borderBottomWidth: t, borderLeftWidth: t * 1.3, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color, marginLeft: t * 0.5 }} />
      </View>
    </View>
  );
}

export function PersonIcon({ color, size = 22 }: { color: string; size?: number }) {
  const bw = Math.max(1.8, size * 0.09);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21, borderWidth: bw, borderColor: color, marginBottom: size * 0.08 }} />
      <View style={{ width: size * 0.72, height: size * 0.34, borderWidth: bw, borderColor: color, borderTopLeftRadius: size * 0.36, borderTopRightRadius: size * 0.36, borderBottomWidth: 0 }} />
    </View>
  );
}
