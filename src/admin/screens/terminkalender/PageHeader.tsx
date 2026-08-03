import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { s } from './styles';

interface Props {
  viewMode: 'week' | 'day';
  /** Wochenspanne bzw. ausgeschriebener Tag. */
  subtitle: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelectWeek: () => void;
  onSelectDay: () => void;
}

// Kopfzeile: Titel, Zeitraum und die Navigation (zurück/heute/vor, Woche/Tag).
export function PageHeader({ viewMode, subtitle, onPrev, onNext, onToday, onSelectWeek, onSelectDay }: Props) {
  return (
    <View style={s.pageHeader}>
      <View style={s.pageHeaderLeft}>
        <Text style={s.pageTitle}>Terminkalender</Text>
        <Text style={s.pageSubtitle}>{subtitle}</Text>
      </View>
      <View style={s.pageHeaderRight}>
        <View style={s.navGroup}>
          <TouchableOpacity style={s.navBtn} onPress={onPrev} activeOpacity={0.7}>
            <Text style={s.navBtnText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.todayBtn} onPress={onToday} activeOpacity={0.7}>
            <Text style={s.todayBtnText}>Heute</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.navBtn} onPress={onNext} activeOpacity={0.7}>
            <Text style={s.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={s.viewToggle}>
          <TouchableOpacity
            style={[s.viewBtn, viewMode === 'week' && s.viewBtnActive]}
            onPress={onSelectWeek}
            activeOpacity={0.7}
          >
            <Text style={[s.viewBtnText, viewMode === 'week' && s.viewBtnTextActive]}>Woche</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.viewBtn, viewMode === 'day' && s.viewBtnActive]}
            onPress={onSelectDay}
            activeOpacity={0.7}
          >
            <Text style={[s.viewBtnText, viewMode === 'day' && s.viewBtnTextActive]}>Tag</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
