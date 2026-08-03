import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { PROGRAMS, PROGRAM_CAPACITY, PROGRAM_COLORS, ProgramId } from '../../constants/programs';
import { LEVEL_LABELS, LEVEL_COLORS, PlayerLevel } from '../../types';
import { fmtDateShort } from '../../utils/date';
import { TrainerSlot } from '../types';
import { styles } from '../styles';

// Eine Trainingseinheit mit allen Teilnehmern (Gruppen zeigen n/Kapazität).
function SlotCard({ slot }: { slot: TrainerSlot }) {
  const prog = PROGRAMS.find(p => p.id === slot.program);
  const color = PROGRAM_COLORS[slot.program] ?? '#5A8C6A';
  const capacity = PROGRAM_CAPACITY[slot.program as ProgramId] ?? slot.members.length;
  const isGroup = capacity > 1;

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardBody}>
          <Text style={[styles.cardProgram, { color }]}>{prog?.name ?? slot.program}</Text>
          <Text style={styles.cardDate}>
            {fmtDateShort(slot.date)} · {slot.time} Uhr{slot.location ? ` · ${slot.location}` : ''}
          </Text>
        </View>
        {isGroup && (
          <View style={[styles.countBadge, { backgroundColor: color + '1A' }]}>
            <Text style={[styles.countText, { color }]}>{slot.members.length}/{capacity}</Text>
          </View>
        )}
      </View>

      <View style={styles.memberList}>
        {slot.members.map(m => (
          <View key={m.id} style={styles.memberRow}>
            <View style={[styles.levelDot, { backgroundColor: m.level ? (LEVEL_COLORS[m.level as PlayerLevel] ?? '#D1D5DB') : '#D1D5DB' }]} />
            <Text style={styles.memberName}>{m.name}</Text>
            {m.level && <Text style={styles.memberLevel}>{LEVEL_LABELS[m.level as PlayerLevel] ?? m.level}</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}

interface Props {
  todaySlots: TrainerSlot[];
  upcomingSlots: TrainerSlot[];
}

export function TermineTab({ todaySlots, upcomingSlots }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionTitle}>Heute ({todaySlots.length})</Text>
      {todaySlots.length === 0 ? (
        <Text style={styles.empty}>Keine Trainings heute.</Text>
      ) : (
        todaySlots.map(s => <SlotCard key={s.key} slot={s} />)
      )}

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
        Bevorstehend ({upcomingSlots.length})
      </Text>
      {upcomingSlots.length === 0 ? (
        <Text style={styles.empty}>Keine weiteren Trainings.</Text>
      ) : (
        upcomingSlots.map(s => <SlotCard key={s.key} slot={s} />)
      )}
    </ScrollView>
  );
}
