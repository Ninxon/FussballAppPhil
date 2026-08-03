import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { CustomerProfile, MutationResult } from '../../hooks/useAdminData';
import { styles } from './styles';

interface Props {
  customer: CustomerProfile;
  /** Anzahl noch anstehender Termine — Warnhinweis vor dem Löschen. */
  upcomingCount: number;
  onBack: () => void;
  onDeleteCustomer: (id: string) => Promise<MutationResult>;
}

// Kopfbereich: Zurück-Link, Avatar/Name und das Löschen (inkl. Bestätigung).
export function CustomerHeader({ customer, upcomingCount, onBack, onDeleteCustomer }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTorwart = customer.player_type === 'torwart';
  const birthYear = customer.birth_date ? parseInt(customer.birth_date.slice(0, 4)) : null;

  const doDelete = async () => {
    setLoading(true);
    setError(null);
    const { error: err } = await onDeleteCustomer(customer.id);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Text style={styles.backArrow}>‹</Text>
        <Text style={styles.backLabel}>Zurück zur Spielerliste</Text>
      </TouchableOpacity>

      <View style={styles.pageHeader}>
        <View style={[styles.avatar, { backgroundColor: isTorwart ? 'rgba(155,89,182,0.12)' : 'rgba(74,143,232,0.12)' }]}>
          <Text style={[styles.avatarLetter, { color: isTorwart ? '#9B59B6' : '#4A8FE8' }]}>
            {isTorwart ? 'T' : 'F'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.customerName}>{customer.full_name}</Text>
          <Text style={styles.customerSub}>
            {isTorwart ? 'Torwart' : customer.player_type === 'feldspieler' ? 'Feldspieler' : 'Spieler'} #{customer.customer_number}
            {birthYear ? ` · Jg. ${birthYear}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteHeaderBtn}
          onPress={() => { setShowConfirm(true); setError(null); }}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteHeaderBtnText}>Löschen</Text>
        </TouchableOpacity>
      </View>

      {showConfirm && (
        <View style={styles.deleteConfirmBox}>
          <Text style={styles.deleteConfirmTitle}>Spieler unwiderruflich löschen?</Text>
          <Text style={styles.deleteConfirmSub}>
            <Text style={{ fontWeight: '700' }}>{customer.full_name}</Text> und alle zugehörigen Termine werden dauerhaft gelöscht. Der Eltern-Account und etwaige Geschwister bleiben bestehen.
          </Text>
          {upcomingCount > 0 && (
            <Text style={[styles.deleteConfirmSub, { color: '#B91C1C', fontWeight: '700' }]}>
              ⚠️ Dabei {upcomingCount === 1 ? 'geht 1 noch anstehender Termin' : `gehen ${upcomingCount} noch anstehende Termine`} unwiderruflich verloren.
            </Text>
          )}
          <Text style={[styles.deleteConfirmSub, { fontStyle: 'italic' }]}>
            Nur zum Pausieren? Spieler stattdessen oben „deaktivieren" — das behält alle Daten.
          </Text>
          {error && <Text style={styles.deleteError}>{error}</Text>}
          <View style={styles.deleteConfirmBtns}>
            <TouchableOpacity style={[styles.deleteConfirmYes, loading && { opacity: 0.6 }]} onPress={doDelete} disabled={loading} activeOpacity={0.7}>
              <Text style={styles.deleteConfirmYesText}>{loading ? 'Wird gelöscht...' : 'Ja, endgültig löschen'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteConfirmNo} onPress={() => setShowConfirm(false)} activeOpacity={0.7}>
              <Text style={styles.deleteConfirmNoText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}
