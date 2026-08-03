import React, { useRef } from 'react';
import { TouchableOpacity, Text, ViewStyle, Animated, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';

type Variant = 'primary' | 'ghost' | 'red';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  /** Spinner statt Label; blockiert onPress solange aktiv. */
  loading?: boolean;
  /** Optionales Icon links vom Label. */
  icon?: React.ReactNode;
  /** Pfeil rechts (nur primary); default true = bisheriges Verhalten. */
  showArrow?: boolean;
  style?: ViewStyle;
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    btn: {
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    prim: {
      backgroundColor: C.accent,
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.22,
      shadowRadius: 12,
      elevation: 5,
    },
    red: {
      backgroundColor: C.red,
      shadowColor: C.red,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 8,
      elevation: 4,
    },
    ghost: {
      backgroundColor: C.accentBg,
      borderWidth: 1.5,
      borderColor: C.accent,
    },
    label: {
      color: C.textMid,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.1,
    },
    ghostLabel: {
      color: C.accent,
    },
    arrow: {
      color: 'rgba(255,255,255,0.65)',
      fontSize: 20,
    },
  });
}

export function Btn({
  label, onPress, variant = 'primary', disabled = false,
  loading = false, icon, showArrow = true, style,
}: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const scale = useRef(new Animated.Value(1)).current;
  const isPrim = variant === 'primary';
  const isRed = variant === 'red';
  const isBlocked = disabled || loading;

  const pressIn = () => Animated.timing(scale, { toValue: 0.982, duration: 80, useNativeDriver: true }).start();
  const pressOut = () => Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={isBlocked}
        activeOpacity={1}
        style={[
          styles.btn,
          isPrim && styles.prim,
          isRed && styles.red,
          !isPrim && !isRed && styles.ghost,
          disabled && { opacity: 0.4 },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={isPrim || isRed ? '#fff' : C.accent} />
        ) : (
          <>
            {icon}
            <Text style={[styles.label, (isPrim || isRed) && { color: '#fff' }, (!isPrim && !isRed) && styles.ghostLabel]}>
              {label}
            </Text>
            {isPrim && showArrow && <Text style={styles.arrow}>→</Text>}
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}
