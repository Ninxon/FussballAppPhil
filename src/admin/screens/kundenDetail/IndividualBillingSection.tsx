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
  /** Manuelle Korrektur des laufenden Blocks (+/-), 0 = keine. */
  adjust: number;
  todayStr: string;
  onMarkIndividualBilled: (customerId: string) => Promise<MutationResult>;
  onAdjustIndividualBilling: (customerId: string, delta: number) => Promise<MutationResult>;
}

/**
 * Merkhilfe fuer die Abrechnung: Die Betreiber stellen nach je 4 absolvierten
 * Einzeltraining-Einheiten eine Rechnung. Angezeigt wird der laufende Block seit
 * der letzten Abrechnung; "Ist bezahlt" setzt den Stichtag auf heute.
 *
 * Fuer Spezialfaelle laesst sich der Stand von Hand verschieben. Die Termine
 * bleiben dabei die Quelle — die Korrektur ist ein Offset, kein Ersatzzaehler.
 */
export function IndividualBillingSection({
  customerId, appointments, billedSince, adjust, todayStr,
  onMarkIndividualBilled, onAdjustIndividualBilling,
}: Props) {
  const [confirming, setConfirming] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [adjusting, setAdjusting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { completed, upcoming, due } = React.useMemo(
    () => individualBillingStatus(appointments, billedSince, todayStr, adjust),
    [appointments, billedSince, todayStr, adjust],
  );

  const remaining = INDIVIDUAL_BILLING_BLOCK - completed;
  // Nichts abzurechnen — aber ein stehengebliebener negativer Offset muss sich
  // ueber "Ist bezahlt" aufraeumen lassen, auch wenn der Zaehler auf 0 klemmt.
  const nothingToBill = completed === 0 && adjust === 0;

  const doAdjust = async (delta: number) => {
    setAdjusting(true);
    setError(null);
    const res = await onAdjustIndividualBilling(customerId, delta);
    setAdjusting(false);
    if (res.error) setError(res.error);
  };

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

      {adjust !== 0 && (
        <Text style={styles.billingAdjustNote}>
          davon manuell: {adjust > 0 ? '+' : '−'}{Math.abs(adjust)}
        </Text>
      )}

      {/* Spezialfaelle: Einheit ausserhalb der App gehalten, Kulanz, Barzahlung.
          "−" bleibt bei 0 gesperrt — ein negativer Zaehler waere sinnlos. */}
      <View style={styles.billingAdjustRow}>
        <Text style={styles.billingAdjustLabel}>Manuell korrigieren</Text>
        <TouchableOpacity
          style={[styles.billingAdjustBtn, (completed === 0 || adjusting) && styles.billingAdjustBtnMuted]}
          onPress={() => doAdjust(-1)}
          disabled={completed === 0 || adjusting}
          activeOpacity={0.7}
          accessibilityLabel="Eine Einheit abziehen"
        >
          <Text style={[styles.billingAdjustBtnText, (completed === 0 || adjusting) && styles.billingAdjustBtnTextMuted]}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.billingAdjustBtn, adjusting && styles.billingAdjustBtnMuted]}
          onPress={() => doAdjust(1)}
          disabled={adjusting}
          activeOpacity={0.7}
          accessibilityLabel="Eine Einheit hinzufügen"
        >
          <Text style={[styles.billingAdjustBtnText, adjusting && styles.billingAdjustBtnTextMuted]}>+</Text>
        </TouchableOpacity>
      </View>

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
            {adjust !== 0 && ' Die manuelle Korrektur wird dabei mit zurückgesetzt.'}
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
          style={[styles.billingResetBtn, nothingToBill && styles.billingResetBtnMuted]}
          onPress={() => setConfirming(true)}
          disabled={nothingToBill}
          activeOpacity={0.7}
        >
          <Text style={[styles.billingResetBtnText, nothingToBill && styles.billingResetBtnTextMuted]}>
            Ist bezahlt – zurücksetzen
          </Text>
        </TouchableOpacity>
      )}
    </SectionCard>
  );
}
