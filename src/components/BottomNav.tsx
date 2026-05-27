import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { Tab } from '../types';

interface Props {
  tab: Tab;
  setTab: (t: Tab) => void;
}

function HomeIcon({ active, C }: { active: boolean; C: Colors }) {
  const c = active ? C.accent : C.textFaint;
  return (
    <View style={[iconStyles.icon, { alignItems: 'center', justifyContent: 'center' }]}>
      <View style={[iconStyles.houseRoof, { borderBottomColor: c }]} />
      <View style={[iconStyles.houseBody, { borderColor: c }]} />
    </View>
  );
}

function ListIcon({ active, C }: { active: boolean; C: Colors }) {
  const c = active ? C.accent : C.textFaint;
  return (
    <View style={iconStyles.icon}>
      {[0, 4, 8].map(y => (
        <View key={y} style={[iconStyles.line, { marginTop: y === 0 ? 0 : 3, width: y === 8 ? 16 : 24, backgroundColor: c }]} />
      ))}
    </View>
  );
}

function PlusIcon({ active, C }: { active: boolean; C: Colors }) {
  const c = active ? C.accent : C.textFaint;
  return (
    <View style={[iconStyles.icon, { alignItems: 'center', justifyContent: 'center' }]}>
      <View style={[iconStyles.plusH, { backgroundColor: c }]} />
      <View style={[iconStyles.plusV, { backgroundColor: c }]} />
    </View>
  );
}

function InfoIcon({ active, C }: { active: boolean; C: Colors }) {
  const c = active ? C.accent : C.textFaint;
  return (
    <View style={[iconStyles.icon, { alignItems: 'center', justifyContent: 'center' }]}>
      <View style={[iconStyles.infoCircle, { borderColor: c }]}>
        <Text style={[iconStyles.infoI, { color: c }]}>i</Text>
      </View>
    </View>
  );
}

function ProfilIcon({ active, C }: { active: boolean; C: Colors }) {
  const c = active ? C.accent : C.textFaint;
  return (
    <View style={[iconStyles.icon, { alignItems: 'center', justifyContent: 'center' }]}>
      <View style={[iconStyles.head, { borderColor: c }]} />
      <View style={[iconStyles.shoulders, { borderColor: c }]} />
    </View>
  );
}

const iconStyles = StyleSheet.create({
  icon: { width: 24, height: 24, justifyContent: 'center' },
  line: { height: 2, borderRadius: 1 },
  houseRoof: { width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginBottom: 1 },
  houseBody: { width: 13, height: 9, borderWidth: 1.8, borderRadius: 1 },
  plusH: { position: 'absolute', width: 18, height: 2.5, borderRadius: 1.5 },
  plusV: { position: 'absolute', width: 2.5, height: 18, borderRadius: 1.5 },
  infoCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.8, alignItems: 'center', justifyContent: 'center' },
  infoI: { fontSize: 11, fontWeight: '800', lineHeight: 14 },
  head: { width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.8, marginBottom: 2 },
  shoulders: { width: 16, height: 7, borderWidth: 1.8, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomWidth: 0 },
});

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'termine', label: 'Termine' },
  { id: 'buchen', label: 'Nachholtermin' },
  { id: 'infos', label: 'Infos' },
  { id: 'profil', label: 'Profil' },
];

function getStyles(C: Colors) {
  return StyleSheet.create({
    nav: {
      flexDirection: 'row',
      backgroundColor: C.navBg,
      borderTopWidth: 1,
      borderTopColor: C.navBorder,
      paddingTop: 10,
      shadowColor: '#152238',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 8,
    },
    item: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
    activeDot: {
      position: 'absolute',
      top: -10,
      width: 32,
      height: 3,
      borderRadius: 2,
      backgroundColor: C.accent,
    },
    itemLabelActive: { fontSize: 10, fontWeight: '700', color: C.accent, letterSpacing: 0.05 },
    itemLabelInactive: { fontSize: 10, fontWeight: '500', color: C.textFaint, letterSpacing: 0.05 },
  });
}

export function BottomNav({ tab, setTab }: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const pb = Math.max(insets.bottom, 16);

  return (
    <View style={[styles.nav, { paddingBottom: pb }]}>
      {TABS.map(({ id, label }) => {
        const active = tab === id;
        const labelStyle = active ? styles.itemLabelActive : styles.itemLabelInactive;
        return (
          <TouchableOpacity key={id} style={styles.item} onPress={() => setTab(id)} activeOpacity={0.7}>
            {active && <View style={styles.activeDot} />}
            {id === 'home' && <HomeIcon active={active} C={C} />}
            {id === 'termine' && <ListIcon active={active} C={C} />}
            {id === 'buchen' && <PlusIcon active={active} C={C} />}
            {id === 'infos' && <InfoIcon active={active} C={C} />}
            {id === 'profil' && <ProfilIcon active={active} C={C} />}
            <Text style={labelStyle} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
