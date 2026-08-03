import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { AdminAppointment, MutationResult } from '../../hooks/useAdminData';
import { PROGRAMS, PROGRAM_COLORS } from '../../../constants/programs';
import { todayStr, fmtDate } from '../../../utils/date';
import { styles } from './styles';

interface Props {
  appt: AdminAppointment;
  /** Fehlt der Handler, ist die Zeile reine Anzeige (vergangene Termine). */
  onCancel?: (id: string, reason?: string) => Promise<MutationResult>;
}

// Eine Terminzeile mit optionalem Storno-Ablauf (Grund + Bestätigung).
export function ApptRow({ appt, onCancel }: Props) {
  const prog = PROGRAMS.find(p => p.id === appt.program);
  const color = PROGRAM_COLORS[appt.program] ?? '#4A8FE8';
  const ts = todayStr();
  const isUpcoming = appt.status === 'confirmed' && appt.date >= ts;
  const dimmed = appt.status === 'cancelled' || appt.date < ts;

  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doCancel = async () => {
    if (!onCancel) return;
    setLoading(true); setError(null);
    const { error: err } = await onCancel(appt.id, reason.trim() || undefined);
    setLoading(false);
    if (err) setError(err);
    else { setConfirming(false); setReason(''); }
  };

  return (
    <View>
      <View style={[styles.apptRow, dimmed && { opacity: 0.5 }]}>
        <View style={[styles.apptColorBar, { backgroundColor: dimmed ? '#D1D5DB' : color }]} />
        <View style={styles.apptInfo}>
          <Text style={[styles.apptProg, { color: appt.status === 'cancelled' ? '#7A90AE' : color }]}>{prog?.name ?? appt.program}</Text>
          <Text style={styles.apptDate}>{fmtDate(appt.date)} · {appt.time} Uhr</Text>
        </View>
        {appt.status === 'cancelled' && (
          <View style={styles.cancelledBadge}><Text style={styles.cancelledText}>Storniert</Text></View>
        )}
        {isUpcoming && onCancel && !confirming && (
          <TouchableOpacity style={styles.stornBtn} onPress={() => setConfirming(true)} activeOpacity={0.7}>
            <Text style={styles.stornText}>Stornieren</Text>
          </TouchableOpacity>
        )}
      </View>
      {confirming && (
        <View style={styles.stornConfirmBox}>
          <TextInput
            style={[styles.input, styles.stornReasonInput]}
            value={reason}
            onChangeText={setReason}
            placeholder="Grund (optional) – wird dem Kunden per E-Mail mitgeteilt"
            placeholderTextColor="#8A98AC"
            multiline
          />
          {error && <Text style={styles.deleteError}>{error}</Text>}
          <View style={styles.stornConfirmBtns}>
            <TouchableOpacity style={[styles.stornConfirmYes, loading && { opacity: 0.6 }]} onPress={doCancel} disabled={loading} activeOpacity={0.7}>
              <Text style={styles.stornConfirmYesText}>{loading ? 'Wird storniert…' : 'Stornieren & E-Mail senden'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stornConfirmNo} onPress={() => { setConfirming(false); setReason(''); setError(null); }} activeOpacity={0.7}>
              <Text style={styles.stornConfirmNoText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
