import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';

// Großer Screen-Header mit "PK Fussballschule"-Eyebrow (Home, Infos).
export function ScreenHeader({ children }: { children: React.ReactNode }) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 28 }]}>
      <Text style={styles.headerSub}>PK Fussballschule</Text>
      <Text style={styles.headerTitle}>{children}</Text>
    </View>
  );
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    header: {
      paddingHorizontal: 24,
      paddingBottom: 28,
    },
    headerSub: {
      fontSize: 13,
      fontWeight: '600',
      color: C.textFaint,
      letterSpacing: 0.15,
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    headerTitle: {
      fontSize: 32,
      fontWeight: '800',
      color: C.text,
      lineHeight: 38,
      letterSpacing: -0.5,
    },
  });
}
