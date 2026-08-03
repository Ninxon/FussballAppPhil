import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { CATEGORY_COLORS } from '../../constants/programs';
import { CancellationToken } from '../../types';
import { fmtDate } from '../../utils/date';
import { FadeUp, SectionTitle } from './ui';

interface Props {
  tokenIndividual?: CancellationToken;
  tokenGruppe?: CancellationToken;
  onSelectCategory: (category: 'individual' | 'gruppe') => void;
}

// Schritt 1 (nur wenn Tokens beider Kategorien existieren): Einzel oder Gruppe?
export function CategoryStep({ tokenIndividual, tokenGruppe, onSelectCategory }: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);

  return (
    <FadeUp>
      <SectionTitle t="Nachholtermin buchen" sub="Welche Art von Training möchtest du nachholen?" />
      <TouchableOpacity
        onPress={() => onSelectCategory('individual')}
        activeOpacity={0.85}
        style={styles.categoryCard}
      >
        <View style={[styles.categoryAccentBar, { backgroundColor: CATEGORY_COLORS.individual }]} />
        <View style={styles.categoryContent}>
          <View style={styles.categoryBody}>
            <Text style={styles.categoryTag}>EINZELTRAINING</Text>
            <Text style={styles.categoryName}>Nachholtermin buchen</Text>
            <Text style={styles.categorySub}>1 Spieler · 55 Min.</Text>
            {tokenIndividual && (
              <Text style={styles.categoryExpiry}>Token gültig bis {fmtDate(tokenIndividual.expires_at.slice(0, 10))}</Text>
            )}
          </View>
          <Text style={styles.categoryArrow}>›</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onSelectCategory('gruppe')}
        activeOpacity={0.85}
        style={styles.categoryCard}
      >
        <View style={[styles.categoryAccentBar, { backgroundColor: CATEGORY_COLORS.gruppe }]} />
        <View style={styles.categoryContent}>
          <View style={styles.categoryBody}>
            <Text style={styles.categoryTag}>GRUPPENTRAINING</Text>
            <Text style={styles.categoryName}>Nachholtermin buchen</Text>
            <Text style={styles.categorySub}>max. 4 Spieler · 55 Min.</Text>
            {tokenGruppe && (
              <Text style={styles.categoryExpiry}>Token gültig bis {fmtDate(tokenGruppe.expires_at.slice(0, 10))}</Text>
            )}
          </View>
          <Text style={styles.categoryArrow}>›</Text>
        </View>
      </TouchableOpacity>
    </FadeUp>
  );
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    categoryCard: {
      backgroundColor: C.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.cardBorder,
      marginBottom: 12,
      overflow: 'hidden',
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    categoryAccentBar: { height: 4, width: '100%' },
    categoryContent: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 18 },
    categoryBody: { flex: 1 },
    categoryTag: { fontSize: 10, fontWeight: '700', color: C.textFaint, letterSpacing: 1.2, marginBottom: 6 },
    categoryName: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
    categorySub: { fontSize: 13, color: C.textMid, marginTop: 4 },
    categoryExpiry: { fontSize: 12, color: C.textFaint, marginTop: 8 },
    categoryArrow: { fontSize: 24, color: C.textFaint, fontWeight: '300', paddingLeft: 12 },
  });
}
