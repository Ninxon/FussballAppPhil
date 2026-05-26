import { createClient } from 'npm:@supabase/supabase-js';
import nodemailer from 'npm:nodemailer';

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
    .select('id, user_id, date, time, program')
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

      await transporter.sendMail({
        from: `"PK Fußballschule" <${Deno.env.get('GMAIL_USER')}>`,
        to: user.email,
        subject: `⏰ Erinnerung – ${programName} morgen`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#3a7a52">Hallo ${profile?.full_name ?? ''},</h2>
            <p>wir möchten dich an dein Training <strong>morgen</strong> erinnern.</p>
            <table style="background:#f5f5f5;border-radius:10px;padding:16px 24px;width:100%">
              <tr><td style="color:#666;padding:6px 0">Leistung</td><td><strong>${programName}</strong></td></tr>
              <tr><td style="color:#666;padding:6px 0">Datum</td><td><strong>${fmtDate}</strong></td></tr>
              <tr><td style="color:#666;padding:6px 0">Uhrzeit</td><td><strong>${(appt.time as string).slice(0, 5)} Uhr</strong></td></tr>
            </table>
            <p style="color:#888;font-size:14px;margin-top:24px">Bis morgen!<br>Dein PK Fußballschule Team</p>
          </div>
        `,
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
