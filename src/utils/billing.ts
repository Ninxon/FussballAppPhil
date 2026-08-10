// Einzeltraining-Abrechnung: Merkhilfe fuer die Betreiber, die nach je 4
// absolvierten Einheiten eine Rechnung stellen. Kein Guthaben, keine Sperre —
// der Zaehler laeuft bei Ueberschreitung weiter (6 / 4) und wird nur markiert.
//
// Wie ueberall im Projekt string-basiert auf 'YYYY-MM-DD' vergleichen (DST-sicher).

/** Programme, die in denselben Abrechnungstopf zaehlen. */
const INDIVIDUAL_PROGRAMS = ['individual', 'torhueter_individual'];

/** Nach so vielen absolvierten Einheiten wird abgerechnet. */
export const INDIVIDUAL_BILLING_BLOCK = 4;

type BillableAppointment = {
  date: string;
  program: string;
  status: string;
  short_notice_cancel?: boolean | null;
};

export type IndividualBillingStatus = {
  /** Bereits stattgefunden und abrechenbar — zaehlt gegen den 4er-Block. */
  completed: number;
  /** Gebucht, aber noch nicht stattgefunden — nur informativ. */
  upcoming: number;
  /** completed >= INDIVIDUAL_BILLING_BLOCK: Rechnung faellig. */
  due: boolean;
};

/**
 * Einzeltraining-Einheiten eines Spielers seit dem letzten Abrechnungs-Stichtag.
 *
 * Abrechenbar ist alles, was tatsaechlich Kosten verursacht hat: durchgefuehrte
 * Termine (auch No-Shows — der Slot war belegt), Nachholtermine und
 * Kurzfrist-Stornos (Kunde hat innerhalb der 3-Stunden-Frist abgesagt).
 * Regulaer stornierte Termine zaehlen nicht, sie erzeugen stattdessen einen
 * Nachholtermin-Gutschein.
 *
 * `appointments` muss bereits auf einen Spieler gefiltert sein.
 */
export function individualBillingStatus(
  appointments: BillableAppointment[],
  billedSince: string | null | undefined,
  todayStr: string,
): IndividualBillingStatus {
  let completed = 0;
  let upcoming = 0;

  for (const a of appointments) {
    if (!INDIVIDUAL_PROGRAMS.includes(a.program)) continue;

    if (a.date >= todayStr) {
      if (a.status === 'confirmed') upcoming++;
      continue;
    }

    // Stichtag: Termine davor gehoeren zu einer bereits bezahlten Periode.
    // Ein Termin genau am Stichtag ist heute noch nicht "stattgefunden" und
    // faellt ab morgen in die neue Periode — weder doppelt noch verloren.
    if (billedSince && a.date < billedSince) continue;

    const billable =
      a.status === 'confirmed' ||
      (a.status === 'cancelled' && a.short_notice_cancel === true);
    if (billable) completed++;
  }

  return { completed, upcoming, due: completed >= INDIVIDUAL_BILLING_BLOCK };
}
