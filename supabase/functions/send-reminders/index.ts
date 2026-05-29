import { createClient } from 'npm:@supabase/supabase-js';
import nodemailer from 'npm:nodemailer';
import { renderEmailLayout, BRAND_COLORS, FROM_HEADER, EmailRow } from '../_shared/email-template.ts';

const PROGRAM_NAMES: Record<string, string> = {
  individual:           'Individualtraining',
  gruppe:               'Gruppentraining',
  athletik:             'Athletiktraining',
  torhueter_individual: 'Torwart Individual',
  torhueter_gruppe:     'Torwart Gruppe',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: Deno.env.get('GMAIL_USER'),
    pass: Deno.env.get('GMAIL_PASS'),
  },
});

Deno.serve(async (req) => {
  // Fail closed: reject unless CRON_SECRET is configured AND matches the header.
  // (Previously a missing CRON_SECRET skipped the check entirely, leaving the
  // endpoint open to anyone triggering reminder emails.)
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Nur Termine, für die noch keine Erinnerung verschickt wurde (Idempotenz).
  const { data: appointments, error: fetchError } = await supabase
    .from('appointments')
    .select('id, user_id, date, time, program, location')
    .eq('date', tomorrowStr)
    .eq('status', 'confirmed')
    .is('reminder_sent_at', null);

  if (fetchError) {
    console.error('[send-reminders] fetch failed:', fetchError);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!appointments?.length) {
    return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let sent = 0;
  let failed = 0;
  for (const appt of appointments) {
    // Eine Mail darf nicht den ganzen Batch abbrechen: pro Termin isolieren.
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(appt.user_id);
      if (!user?.email) {
        console.warn(`[send-reminders] no email for user ${appt.user_id}, skipping appt ${appt.id}`);
        continue;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', appt.user_id)
        .single();

      const programName = PROGRAM_NAMES[appt.program] ?? 'Training';
      const dateParts = (appt.date as string).split('-');
      const fmtDate = dateParts.length === 3
        ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`
        : appt.date;
      const safeLocation = (appt.location ?? '').replace(/[<>]/g, '').slice(0, 40);
      const safeTime = (appt.time as string).slice(0, 5);

      const rows: EmailRow[] = [
        { label: 'Leistung', value: programName },
        { label: 'Datum', value: fmtDate },
        { label: 'Uhrzeit', value: `${safeTime} Uhr` },
      ];
      if (safeLocation) rows.push({ label: 'Standort', value: safeLocation });

      const html = renderEmailLayout({
        title: 'Erinnerung an dein Training',
        accentColor: BRAND_COLORS.accentBlue,
        preheader: `Morgen um ${safeTime} Uhr: ${programName}.`,
        greeting: `Hallo ${profile?.full_name ?? ''},`,
        intro: 'wir möchten dich an dein Training morgen erinnern.',
        rows,
        signOff: 'Bis morgen!',
      });

      await transporter.sendMail({
        from: FROM_HEADER,
        to: user.email,
        subject: `Erinnerung – ${programName} morgen`,
        html,
      });

      // Erst nach erfolgreichem Versand markieren -> bei Fehler wird beim
      // nächsten Lauf erneut versucht, erfolgreiche Mails nicht doppelt.
      const { error: markError } = await supabase
        .from('appointments')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', appt.id);
      if (markError) {
        console.error(`[send-reminders] sent but failed to mark appt ${appt.id}:`, markError);
      }
      sent++;
    } catch (err) {
      failed++;
      console.error(`[send-reminders] failed to send for appt ${appt.id}:`, err);
    }
  }

  console.log(`[send-reminders] done: sent=${sent} failed=${failed} total=${appointments.length}`);
  return new Response(JSON.stringify({ sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
