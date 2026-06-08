import { createClient } from 'npm:@supabase/supabase-js';

// Synchronisiert die hessischen Schulferien (nur Sommer- + Weihnachtsferien)
// von openholidaysapi.org in die Tabelle public.blocked_periods.
// Aufruf per pg_cron (x-cron-secret). Idempotent: löscht die alten Sync-Zeilen
// und schreibt die aktuellen neu.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const SUBDIVISION = 'DE-HE'; // Hessen
// Welche Ferien gesperrt werden sollen (exakte Namen aus der API):
const BLOCKED_NAMES = new Set(['Sommerferien', 'Weihnachtsferien']);

type ApiHoliday = {
  id: string;
  startDate: string;
  endDate: string;
  name: Array<{ language: string; text: string }>;
};

async function fetchHolidays(from: string, to: string): Promise<ApiHoliday[]> {
  const url =
    `https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE` +
    `&subdivisionCode=${SUBDIVISION}&languageIsoCode=DE` +
    `&validFrom=${from}&validTo=${to}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`openholidaysapi ${res.status}: ${await res.text()}`);
  return await res.json();
}

Deno.serve(async (req) => {
  // Fail closed: nur mit gültigem Cron-Secret.
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Die API erlaubt max. 1095 Tage pro Abfrage -> in 2-Jahres-Fenster splitten.
    const year = new Date().getFullYear();
    const ranges: Array<[string, string]> = [
      [`${year}-01-01`, `${year + 1}-12-31`],
      [`${year + 2}-01-01`, `${year + 3}-12-31`],
      [`${year + 4}-01-01`, `${year + 5}-12-31`],
    ];

    // Dedupe per API-id: jahresübergreifende Ferien tauchen in zwei benachbarten
    // Abfragefenstern auf.
    const byId = new Map<string, ApiHoliday>();
    for (const [from, to] of ranges) {
      for (const h of await fetchHolidays(from, to)) byId.set(h.id, h);
    }
    const all = [...byId.values()];

    const rows = all
      .filter((h) => Array.isArray(h.name) && h.name.some((n) => BLOCKED_NAMES.has(n.text)))
      .map((h) => ({
        start_date: h.startDate,
        end_date: h.endDate,
        reason: h.name.find((n) => n.language === 'DE')?.text ?? h.name[0]?.text ?? 'Ferien',
        source: 'school_holiday_sync',
      }));

    // Idempotent ersetzen: alte Sync-Zeilen löschen, neue einfügen.
    const { error: delErr } = await supabase
      .from('blocked_periods')
      .delete()
      .eq('source', 'school_holiday_sync');
    if (delErr) throw delErr;

    if (rows.length) {
      const { error: insErr } = await supabase.from('blocked_periods').insert(rows);
      if (insErr) throw insErr;
    }

    console.log(`[sync-school-holidays] synced=${rows.length}`);
    return new Response(JSON.stringify({ synced: rows.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[sync-school-holidays]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
