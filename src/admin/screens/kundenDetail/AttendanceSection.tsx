import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AdminAppointment, MutationResult } from '../../hooks/useAdminData';
import { PROGRAMS } from '../../../constants/programs';
import { fmtDate } from '../../../utils/date';
import { SectionCard } from './ui';
import { styles } from './styles';

interface Props {
  appointments: AdminAppointment[];
  todayStr: string;
  onMarkAttended: (apptId: string, attended: boolean | null) => Promise<MutationResult>;
}

// Anwesenheit vergangener Individualtrainings (Ja / No-Show, erneutes Tippen hebt auf).
export function AttendanceSection({ appointments, todayStr, onMarkAttended }: Props) {
  const indAppts = appointments
    .filter(a =>
      a.status === 'confirmed' &&
      a.date < todayStr &&
      (a.program === 'individual' || a.program === 'torhueter_individual'),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  if (indAppts.length === 0) return null;

  const attendedCount = indAppts.filter(a => a.attended === true).length;

  return (
    <SectionCard title="Anwesenheit – Individualtraining">
      <Text style={styles.attendanceCounter}>
        {attendedCount} von {indAppts.length} Terminen wahrgenommen
      </Text>
      {indAppts.map(a => {
        const prog = PROGRAMS.find(p => p.id === a.program);
        return (
          <View key={a.id} style={styles.attendanceRow}>
            <View style={styles.attendanceInfo}>
              <Text style={styles.attendanceProg}>{prog?.name ?? a.program}</Text>
              <Text style={styles.attendanceDate}>{fmtDate(a.date)} · {a.time} Uhr</Text>
            </View>
            <View style={styles.attendanceBtns}>
              <TouchableOpacity
                style={[styles.attendanceBtn, a.attended === true && styles.attendanceBtnPresent]}
                onPress={() => onMarkAttended(a.id, a.attended === true ? null : true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.attendanceBtnText, a.attended === true && styles.attendanceBtnTextPresent]}>Ja</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.attendanceBtn, a.attended === false && styles.attendanceBtnAbsent]}
                onPress={() => onMarkAttended(a.id, a.attended === false ? null : false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.attendanceBtnText, a.attended === false && styles.attendanceBtnTextAbsent]}>No-Show</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </SectionCard>
  );
}
