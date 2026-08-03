import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './styles';

interface Props {
  title: string;
  /** Muss die konkrete Auswirkung benennen, nicht nur „wirklich löschen?". */
  text: string;
  confirmLabel: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// Inline-Bestätigung im Stil des Admin-Bereichs (kein window.confirm — das
// gibt es im gesamten Projekt nicht).
export function ConfirmBox({ title, text, confirmLabel, loading, error, onConfirm, onCancel }: Props) {
  return (
    <View style={styles.confirmBox}>
      <Text style={styles.confirmTitle}>{title}</Text>
      <Text style={styles.confirmText}>{text}</Text>
      {error && <Text style={[styles.errorText, { marginTop: 0, marginBottom: 12 }]}>{error}</Text>}
      <View style={styles.confirmBtns}>
        <TouchableOpacity
          style={[styles.confirmYes, loading && { opacity: 0.6 }]}
          onPress={onConfirm}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={styles.confirmYesText}>{loading ? 'Wird ausgeführt…' : confirmLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.neutralBtn} onPress={onCancel} activeOpacity={0.7}>
          <Text style={styles.neutralBtnText}>Abbrechen</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
