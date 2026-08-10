import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AdminAppointment, MutationResult } from '../../hooks/useAdminData';
import { individualBillingStatus, INDIVIDUAL_BILLING_BLOCK } from '../../../utils/billing';
import { fmtDateShort } from '../../../utils/date';
import { SectionCard } from './ui';
import { styles } from './styles';

interface Props {
  customerId: string;
  appointments: AdminAppointment[];
  billedSince: string;
  todayStr: string;
  onMarkIndividualBilled: (customerId: string) => Promise<MutationResult>;
}

/**
 * Merkhilfe fuer die Abrechnung: Die Betreiber stellen nach je 4 absolvierten
 * Einzeltraining-Einheiten eine Rechnung. Angezeigt wird der laufende Block seit
 * der letzten Abrechnung; "Ist bezahlt" setzt den Stichtag auf heute.
 */
export function IndividualBillingSection({
  customerId, appointments, billedSince, todayStr, onMarkIndividualBilled,
}: Props) {
  const [confirming, setConfirming] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { completed, upcoming, due } = React.useMemo(
    () => individualBillingStatus(appointments, billedSince, todayStr),
    [appointments, billedSince, todayStr],
  );

  const remaining = INDIVIDUAL_BILLING_BLOCK - completed;

  const doReset = async () => {
    setSaving(true);
    setError(null);
    const res = await onMarkIndividualBilled(customerId);
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setConfirming(false);
  };

  return (
    <SectionCard title="Einzeltraining-Abrechnung">
      <View style={styles.billingHead}>
        <Text style={[styles.billingCount, due && styles.billingCountDue]}>
          {completed} / {INDIVIDUAL_BILLING_BLOCK}
        </Text>
        <Text style={styles.billingUnit}>Einheiten</Text>
      </View>

      {/* Fortschrittsbalken: eine Zelle je Einheit des Blocks. */}
      <View style={styles.billingBar}>
        {Array.from({ length: INDIVIDUAL_BILLING_BLOCK }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.billingSegment,
              i < completed && (due ? styles.billingSegmentDue : styles.billingSegmentFilled),
            ]}
          />
        ))}
      </View>

      <Text style={[styles.billingHint, due && styles.billingHintDue]}>
        {due
          ? completed > INDIVIDUAL_BILLING_BLOCK
            ? `Abrechnung fällig — ${completed - INDIVIDUAL_BILLING_BLOCK} Einheit${completed - INDIVIDUAL_BILLING_BLOCK === 1 ? '' : 'en'} über dem Block`
            : 'Abrechnung fällig'
          : `noch ${remaining} Einheit${remaining === 1 ? '' : 'en'} bis zur Abrechnung`}
      </Text>

      {upcoming > 0 && (
        <Text style={styles.billingUpcoming}>
          + {upcoming} gebucht (noch nicht stattgefunden)
        </Text>
      )}

      {/* Guard fuer das Rollout-Fenster: Code kann live sein, bevor die Migration
          die Spalte angelegt hat — dann lieber die Zeile weglassen als crashen. */}
      {billedSince && (
        <Text style={styles.billingSince}>abgerechnet seit {fmtDateShort(billedSince)}</Text>
      )}

      {error && <Text style={styles.fieldError}>{error}</Text>}

      {confirming ? (
        <View style={styles.billingConfirmBox}>
          <Text style={styles.billingConfirmText}>
            {completed} Einheit{completed === 1 ? '' : 'en'} als bezahlt markieren? Der Zähler startet
            wieder bei 0 und lässt sich nicht zurückholen.
          </Text>
          <View style={styles.billingConfirmBtns}>
            <TouchableOpacity
              style={styles.billingConfirmYes}
              onPress={doReset}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={styles.billingConfirmYesText}>{saving ? 'Speichert…' : 'Ja, abrechnen'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.billingConfirmNo}
              onPress={() => { setConfirming(false); setError(null); }}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={styles.billingConfirmNoText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.billingResetBtn, completed === 0 && styles.billingResetBtnMuted]}
          onPress={() => setConfirming(true)}
          disabled={completed === 0}
          activeOpacity={0.7}
        >
          <Text style={[styles.billingResetBtnText, completed === 0 && styles.billingResetBtnTextMuted]}>
            Ist bezahlt – zurücksetzen
          </Text>
        </TouchableOpacity>
      )}
    </SectionCard>
  );
}
