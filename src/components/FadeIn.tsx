import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ViewStyle, StyleProp } from 'react-native';

interface Props {
  children: React.ReactNode;
  /** Dauer der Einblendung; die Screens behalten ihre bisherigen Werte. */
  duration?: number;
  /** Start-Versatz nach unten in px. */
  offset?: number;
  style?: StyleProp<ViewStyle>;
}

// Gemeinsame Eintritts-Animation (Fade + Slide-up) der Kunden-Screens.
export function FadeIn({ children, duration = 350, offset = 16, style }: Props) {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(offset)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[{ opacity: fade, transform: [{ translateY: slide }] }, style]}>
      {children}
    </Animated.View>
  );
}
