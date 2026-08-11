import { individualBillingStatus, INDIVIDUAL_BILLING_BLOCK } from '../utils/billing';

const TODAY = '2026-08-10';
const SINCE = '2026-07-01';

type Appt = {
  date: string;
  program: string;
  status: string;
  short_notice_cancel?: boolean | null;
};

const appt = (date: string, over: Partial<Appt> = {}): Appt => ({
  date,
  program: 'individual',
  status: 'confirmed',
  ...over,
});

describe('individualBillingStatus – Stichtag', () => {
  it('ignoriert Termine vor dem Abrechnungs-Stichtag', () => {
    const res = individualBillingStatus(
      [appt('2026-06-30'), appt('2026-07-01'), appt('2026-07-15')],
      SINCE,
      TODAY,
    );
    expect(res.completed).toBe(2);
  });

  it('zaehlt ohne Stichtag alles Vergangene', () => {
    const res = individualBillingStatus([appt('2020-01-01'), appt('2026-07-15')], null, TODAY);
    expect(res.completed).toBe(2);
  });

  it('ein Termin am Stichtag selbst faellt in die neue Periode', () => {
    const res = individualBillingStatus([appt(SINCE)], SINCE, TODAY);
    expect(res.completed).toBe(1);
  });
});

describe('individualBillingStatus – was abrechenbar ist', () => {
  it('zaehlt No-Shows mit (Slot war belegt)', () => {
    // attended wird nicht mehr gefuehrt: ein durchgefuehrter Termin zaehlt so oder so.
    const res = individualBillingStatus([appt('2026-07-15')], SINCE, TODAY);
    expect(res.completed).toBe(1);
  });

  it('zaehlt Kurzfrist-Stornos mit', () => {
    const res = individualBillingStatus(
      [appt('2026-07-15', { status: 'cancelled', short_notice_cancel: true })],
      SINCE,
      TODAY,
    );
    expect(res.completed).toBe(1);
  });

  it('zaehlt regulaere Stornos nicht', () => {
    const res = individualBillingStatus(
      [
        appt('2026-07-15', { status: 'cancelled', short_notice_cancel: false }),
        appt('2026-07-16', { status: 'cancelled' }),
      ],
      SINCE,
      TODAY,
    );
    expect(res.completed).toBe(0);
  });

  it('zaehlt Torwart-Individual im selben Topf', () => {
    const res = individualBillingStatus(
      [appt('2026-07-15', { program: 'torhueter_individual' }), appt('2026-07-16')],
      SINCE,
      TODAY,
    );
    expect(res.completed).toBe(2);
  });

  it('ignoriert Gruppen-, Athletik- und Torwart-Gruppen-Termine', () => {
    const res = individualBillingStatus(
      [
        appt('2026-07-15', { program: 'gruppe' }),
        appt('2026-07-16', { program: 'athletik' }),
        appt('2026-07-17', { program: 'torhueter_gruppe' }),
      ],
      SINCE,
      TODAY,
    );
    expect(res.completed).toBe(0);
    expect(res.upcoming).toBe(0);
  });
});

describe('individualBillingStatus – Zukunft', () => {
  it('zaehlt gebuchte Zukunftstermine als upcoming, nicht als completed', () => {
    const res = individualBillingStatus(
      [appt('2026-08-11'), appt('2026-09-01'), appt('2026-07-15')],
      SINCE,
      TODAY,
    );
    expect(res.completed).toBe(1);
    expect(res.upcoming).toBe(2);
  });

  it('ein Termin heute gilt noch nicht als absolviert', () => {
    const res = individualBillingStatus([appt(TODAY)], SINCE, TODAY);
    expect(res.completed).toBe(0);
    expect(res.upcoming).toBe(1);
  });

  it('stornierte Zukunftstermine zaehlen nirgends', () => {
    const res = individualBillingStatus(
      [appt('2026-09-01', { status: 'cancelled' })],
      SINCE,
      TODAY,
    );
    expect(res.completed).toBe(0);
    expect(res.upcoming).toBe(0);
  });
});

describe('individualBillingStatus – manuelle Korrektur', () => {
  it('addiert die Korrektur auf die abgeleiteten Einheiten', () => {
    const res = individualBillingStatus([appt('2026-07-15')], SINCE, TODAY, 2);
    expect(res.completed).toBe(3);
  });

  it('zieht negativ ab', () => {
    const res = individualBillingStatus(
      [appt('2026-07-15'), appt('2026-07-16')], SINCE, TODAY, -1,
    );
    expect(res.completed).toBe(1);
  });

  it('faengt den Zaehler bei 0 ab statt negativ zu werden', () => {
    const res = individualBillingStatus([appt('2026-07-15')], SINCE, TODAY, -5);
    expect(res.completed).toBe(0);
    expect(res.due).toBe(false);
  });

  it('laesst die Zukunftstermine unberuehrt', () => {
    const res = individualBillingStatus([appt('2026-09-01')], SINCE, TODAY, 3);
    expect(res.completed).toBe(3);
    expect(res.upcoming).toBe(1);
  });

  it('ohne Korrektur bleibt alles wie zuvor', () => {
    const appts = [appt('2026-07-15'), appt('2026-07-16')];
    expect(individualBillingStatus(appts, SINCE, TODAY, 0))
      .toEqual(individualBillingStatus(appts, SINCE, TODAY));
  });
});

describe('individualBillingStatus – Faelligkeit', () => {
  const past = (n: number) =>
    Array.from({ length: n }, (_, i) => appt(`2026-07-${String(i + 1).padStart(2, '0')}`));

  it('ist erst ab dem vollen Block faellig', () => {
    expect(individualBillingStatus(past(3), SINCE, TODAY).due).toBe(false);
    expect(individualBillingStatus(past(INDIVIDUAL_BILLING_BLOCK), SINCE, TODAY).due).toBe(true);
  });

  it('deckelt den Zaehler bei Ueberlauf nicht', () => {
    const res = individualBillingStatus(past(6), SINCE, TODAY);
    expect(res.completed).toBe(6);
    expect(res.due).toBe(true);
  });

  it('macht eine manuelle Korrektur faellig', () => {
    expect(individualBillingStatus(past(3), SINCE, TODAY, 1).due).toBe(true);
  });

  it('leere Terminliste ergibt 0 und nicht faellig', () => {
    expect(individualBillingStatus([], SINCE, TODAY)).toEqual({
      completed: 0,
      upcoming: 0,
      due: false,
    });
  });
});
