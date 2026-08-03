import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Switch } from 'react-native';
import { CustomerProfile, MutationResult } from '../../hooks/useAdminData';
import { BookingPermissions } from '../../../types';
import { styles } from './styles';

const PERMISSION_FLAGS: { key: keyof BookingPermissions; label: string }[] = [
  { key: 'can_book_individual', label: 'Individualtraining' },
  { key: 'can_book_gruppe', label: 'Gruppentraining' },
  { key: 'can_book_athletik', label: 'Athletiktraining' },
  { key: 'can_book_torhueter_individual', label: 'Torwart Individual' },
  { key: 'can_book_torhueter_gruppe', label: 'Torwart Gruppe' },
];

interface Props {
  customer: CustomerProfile;
  tokenCounts?: { individual: number; gruppe: number };
  confirmedTotal: number;
  onSaveBookingPermissions: (customerId: string, permissions: Partial<BookingPermissions>) => Promise<MutationResult>;
  onSaveGroupExempt: (customerId: string, value: boolean) => Promise<MutationResult>;
  onResetTokens: (customerId: string) => Promise<MutationResult>;
  onGrantToken: (customerId: string, category: 'individual' | 'gruppe', expiresDate: string) => Promise<MutationResult>;
}

// Standard-Ablaufdatum für manuell vergebene Gutscheine: heute + 1 Monat.
function defaultExpiry(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Abo/Buchungsberechtigungen inkl. Nachholtermin-Gutscheinen (vergeben/zurücksetzen).
export function PermissionsSection({
  customer, tokenCounts, confirmedTotal,
  onSaveBookingPermissions, onSaveGroupExempt, onResetTokens, onGrantToken,
}: Props) {
  const [permError, setPermError] = useState<string | null>(null);

  const [showGrant, setShowGrant] = useState(false);
  const [grantCategory, setGrantCategory] = useState<'individual' | 'gruppe'>('individual');
  const [grantExpiry, setGrantExpiry] = useState(defaultExpiry);
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantSuccess, setGrantSuccess] = useState(false);

  const [showTokenReset, setShowTokenReset] = useState(false);
  const [tokenResetLoading, setTokenResetLoading] = useState(false);
  const [tokenResetError, setTokenResetError] = useState<string | null>(null);

  const doTogglePermission = async (key: keyof BookingPermissions, value: boolean) => {
    setPermError(null);
    const { error } = await onSaveBookingPermissions(customer.id, { [key]: value });
    if (error) setPermError(error);
  };

  const doToggleGroupExempt = async (value: boolean) => {
    setPermError(null);
    const { error } = await onSaveGroupExempt(customer.id, value);
    if (error) setPermError(error);
  };

  const doResetTokens = async () => {
    setTokenResetLoading(true);
    setTokenResetError(null);
    const { error } = await onResetTokens(customer.id);
    setTokenResetLoading(false);
    if (error) setTokenResetError(error);
    else setShowTokenReset(false);
  };

  // Ob der Kunde ein Programm der Token-Kategorie überhaupt buchen darf.
  // Muss zur BuchenScreen-Logik passen (Token-Kategorie + can_book_* + Spielertyp),
  // sonst sieht der Kunde den Nachholtermin, kann ihn aber nicht buchen.
  const canBookGrantedCategory = (cat: 'individual' | 'gruppe'): boolean => {
    const t = customer.player_type;
    if (cat === 'individual') {
      if (t === 'torwart') return !!customer.can_book_torhueter_individual;
      if (t === 'feldspieler') return !!customer.can_book_individual;
      return !!(customer.can_book_individual || customer.can_book_torhueter_individual);
    }
    if (t === 'torwart') return !!customer.can_book_torhueter_gruppe;
    if (t === 'feldspieler') return !!(customer.can_book_gruppe || customer.can_book_athletik);
    return !!(customer.can_book_gruppe || customer.can_book_athletik || customer.can_book_torhueter_gruppe);
  };

  const doGrantToken = async () => {
    setGrantError(null);
    setGrantSuccess(false);
    if (!canBookGrantedCategory(grantCategory)) {
      const label = grantCategory === 'individual' ? 'Einzeltraining' : 'Gruppentraining';
      setGrantError(
        `${customer.full_name} hat keine Buchungsberechtigung für ${label}. ` +
        `Bitte oben unter „Buchungsberechtigungen" die passende Berechtigung aktivieren — ` +
        `sonst sieht der Kunde den Nachholtermin, kann ihn aber nicht buchen.`,
      );
      return;
    }
    setGrantLoading(true);
    const { error } = await onGrantToken(customer.id, grantCategory, grantExpiry.trim());
    setGrantLoading(false);
    if (error) {
      setGrantError(error);
    } else {
      setGrantSuccess(true);
      setShowGrant(false);
      setGrantExpiry(defaultExpiry());
      setGrantCategory('individual');
    }
  };

  const hasTokens = ((tokenCounts?.individual ?? 0) + (tokenCounts?.gruppe ?? 0)) > 0;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Abo / Buchungsberechtigungen</Text>
      {PERMISSION_FLAGS.map(({ key, label }) => (
        <View key={key} style={styles.permRow}>
          <Text style={styles.permLabel}>{label}</Text>
          <Switch
            value={!!(customer as any)[key]}
            onValueChange={v => doTogglePermission(key, v)}
            trackColor={{ false: '#E5E7EB', true: '#4A8FE8' }}
            thumbColor="#fff"
          />
        </View>
      ))}

      <View style={styles.exemptBox}>
        <View style={styles.exemptRow}>
          <Text style={styles.exemptLabel}>Alters-/Level-Prüfung ignorieren (Gruppen)</Text>
          <Switch
            value={!!customer.skip_group_age_level_check}
            onValueChange={doToggleGroupExempt}
            trackColor={{ false: '#E5E7EB', true: '#F5A84A' }}
            thumbColor="#fff"
          />
        </View>
        <Text style={styles.exemptHint}>
          Wenn aktiv, kann dieser Spieler vom Admin in jede Gruppe gebucht werden — auch wenn Alter/Level normalerweise nicht passen. Kapazität, Tageslimit und Trainer-Verfügbarkeit bleiben aktiv. Gilt nur für Admin-Buchungen, nicht für die Kundensicht.
        </Text>
      </View>

      {permError && <Text style={styles.fieldError}>{permError}</Text>}

      <Text style={styles.sectionLabel}>Aktive Nachholtermine</Text>
      <View style={styles.tokenDisplayRow}>
        <View style={styles.tokenDisplayItem}>
          <Text style={styles.tokenDisplayCount}>{tokenCounts?.individual ?? 0}</Text>
          <Text style={styles.tokenDisplayLabel}>Einzeltraining</Text>
        </View>
        <View style={styles.tokenDisplayItem}>
          <Text style={styles.tokenDisplayCount}>{tokenCounts?.gruppe ?? 0}</Text>
          <Text style={styles.tokenDisplayLabel}>Gruppentraining</Text>
        </View>
        <View style={styles.tokenDisplayItem}>
          <Text style={styles.tokenDisplayCount}>{confirmedTotal}</Text>
          <Text style={styles.tokenDisplayLabel}>Termine gesamt</Text>
        </View>
      </View>

      {grantSuccess && !showGrant && (
        <Text style={styles.grantSuccessText}>✓ Nachholtermin vergeben. Der Kunde kann ihn jetzt buchen.</Text>
      )}

      {showGrant ? (
        <View style={styles.formSection}>
          <Text style={styles.grantTitle}>Nachholtermin geben</Text>
          <Text style={styles.grantSub}>
            {customer.full_name} erhält einen Gutschein und bucht den Slot selbst (Tag, Uhrzeit und Standort wählt der Kunde).
          </Text>

          <Text style={styles.fieldLabel}>Kategorie</Text>
          <View style={styles.programRow}>
            <TouchableOpacity
              style={[styles.programChip, grantCategory === 'individual' && styles.programChipActive]}
              onPress={() => setGrantCategory('individual')}
              activeOpacity={0.7}
            >
              <Text style={[styles.programChipText, grantCategory === 'individual' && styles.programChipTextActive]}>Einzeltraining</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.programChip, grantCategory === 'gruppe' && styles.programChipActive]}
              onPress={() => setGrantCategory('gruppe')}
              activeOpacity={0.7}
            >
              <Text style={[styles.programChipText, grantCategory === 'gruppe' && styles.programChipTextActive]}>Gruppentraining</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Gültig bis (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={grantExpiry}
            onChangeText={setGrantExpiry}
            placeholder={defaultExpiry()}
            placeholderTextColor="#7A90AE"
          />

          {grantError && <Text style={styles.fieldError}>{grantError}</Text>}

          <View style={styles.tokenResetBtns}>
            <TouchableOpacity
              style={[styles.saveBtn, { flex: 1 }, grantLoading && { opacity: 0.6 }]}
              onPress={doGrantToken}
              disabled={grantLoading}
              activeOpacity={0.7}
            >
              <Text style={styles.saveBtnText}>{grantLoading ? 'Wird vergeben...' : 'Gutschein vergeben'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tokenResetNo}
              onPress={() => { setShowGrant(false); setGrantError(null); }}
              activeOpacity={0.7}
            >
              <Text style={styles.tokenResetNoText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.grantBtn}
          onPress={() => { setShowGrant(true); setGrantError(null); setGrantSuccess(false); }}
          activeOpacity={0.7}
        >
          <Text style={styles.grantBtnText}>+ Nachholtermin geben</Text>
        </TouchableOpacity>
      )}

      {hasTokens && (
        showTokenReset ? (
          <View style={styles.tokenResetBox}>
            <Text style={styles.tokenResetTitle}>Alle aktiven Stornierungstokens löschen?</Text>
            <Text style={styles.tokenResetSub}>
              Die unbenutzten Nachholtermine von {customer.full_name} werden entfernt und können nicht mehr eingelöst werden.
            </Text>
            {tokenResetError && <Text style={styles.fieldError}>{tokenResetError}</Text>}
            <View style={styles.tokenResetBtns}>
              <TouchableOpacity style={[styles.tokenResetYes, tokenResetLoading && { opacity: 0.6 }]} onPress={doResetTokens} disabled={tokenResetLoading} activeOpacity={0.7}>
                <Text style={styles.tokenResetYesText}>{tokenResetLoading ? 'Wird zurückgesetzt...' : 'Ja, zurücksetzen'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tokenResetNo} onPress={() => { setShowTokenReset(false); setTokenResetError(null); }} activeOpacity={0.7}>
                <Text style={styles.tokenResetNoText}>Abbrechen</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.tokenResetBtn} onPress={() => { setShowTokenReset(true); setTokenResetError(null); }} activeOpacity={0.7}>
            <Text style={styles.tokenResetBtnText}>Tokens zurücksetzen</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}
