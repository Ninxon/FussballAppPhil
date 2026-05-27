import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer';

const PROGRAM_NAMES: Record<string, string> = {
  individual:           'Individualtraining',
  gruppe:               'Gruppentraining',
  athletik:             'Athletiktraining',
  torhueter_individual: 'Torwart Individual',
  torhueter_gruppe:     'Torwart Gruppe',
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  };
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: Deno.env.get('GMAIL_USER'),
    pass: Deno.env.get('GMAIL_PASS'),
  },
});

function formatDate(d: string): string {
  const parts = d.split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : d;
}

function dowOf(dateStr: string): number {
  const js = new Date(dateStr + 'T12:00:00').getDay();
  return js === 0 ? 7 : js;
}

Deno.serve(async (req) => {
  const cors = corsHeaders();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  try {
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nicht autorisiert' }, 401);

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: 'Nicht autorisiert' }, 401);

    const { data: callerProfile } = await serviceClient
      .from('profiles').select('role').eq('id', caller.id).single();
    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Nur Admins dürfen Slots ändern' }, 403);
    }

    const { trainer_id, day_of_week, time, new_location } = await req.json();
    if (!trainer_id || day_of_week == null || !time || !new_location) {
      return json({ error: 'trainer_id, day_of_week, time, new_location sind erforderlich' }, 400);
    }
    if (new_location !== 'Rüsselsheim' && new_location !== 'Kelsterbach') {
      return json({ error: 'Ungültiger Standort' }, 400);
    }

    // Termine, die der DB-Trigger gerade auf den neuen Standort migriert hat.
    const today = new Date().toISOString().slice(0, 10);
    const { data: appointments, error: loadError } = await serviceClient
      .from('appointments')
      .select('id, user_id, date, time, program, location')
      .eq('trainer_id', trainer_id)
      .eq('status', 'confirmed')
      .eq('location', new_location)
      .gte('date', today);
    if (loadError) {
      return json({ error: `Termine laden fehlgeschlagen: ${loadError.message}` }, 500);
    }

    const matching = (appointments ?? []).filter((a: { date: string; time: string }) =>
      dowOf(a.date) === day_of_week && (a.time ?? '').slice(0, 5) === time,
    );

    if (matching.length === 0) return json({ ok: true, notified: 0 });

    const userIds = [...new Set(matching.map((a: { user_id: string }) => a.user_id))];
    const { data: profiles } = await serviceClient
      .from('profiles').select('id, full_name').in('id', userIds);
    const profilesMap = new Map((profiles ?? []).map((p: { id: string; full_name: string }) => [p.id, p]));

    let notified = 0;
    for (const appt of matching) {
      const { data: userData } = await serviceClient.auth.admin.getUserById(appt.user_id);
      const email = userData?.user?.email;
      if (!email) continue;

      const profile = profilesMap.get(appt.user_id) as { full_name?: string } | undefined;
      const name = (profile?.full_name ?? '').replace(/[<>]/g, '').slice(0, 100);
      const programName = PROGRAM_NAMES[appt.program] ?? 'Training';
      const safeTime = String(appt.time ?? '').replace(/[^0-9:]/g, '').slice(0, 5);
      const safeDate = formatDate(String(appt.date ?? '').replace(/[^0-9-]/g, ''));
      const safeLocation = String(new_location).replace(/[<>]/g, '').slice(0, 40);

      try {
        await transporter.sendMail({
          from: `"PK Fußballschule" <${Deno.env.get('GMAIL_USER')}>`,
          to: email,
          subject: `Standort-Änderung – ${programName}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto">
              <h2 style="color:#3a7a52">Hallo ${name},</h2>
              <p>der Standort eines deiner gebuchten Trainings hat sich geändert.</p>
              <table style="background:#f5f5f5;border-radius:10px;padding:16px 24px;width:100%">
                <tr><td style="color:#666;padding:6px 0">Leistung</td><td><strong>${programName}</strong></td></tr>
                <tr><td style="color:#666;padding:6px 0">Datum</td><td><strong>${safeDate}</strong></td></tr>
                <tr><td style="color:#666;padding:6px 0">Uhrzeit</td><td><strong>${safeTime} Uhr</strong></td></tr>
                <tr><td style="color:#666;padding:6px 0">Neuer Standort</td><td><strong>${safeLocation}</strong></td></tr>
              </table>
              <p>Bei Fragen melde dich gerne bei deinem Trainer.</p>
              <p style="color:#888;font-size:14px;margin-top:24px">Bis bald!<br>Dein PK Fußballschule Team</p>
            </div>
          `,
        });
        notified++;
      } catch (e) {
        console.warn(`Mail an ${email} fehlgeschlagen:`, e);
      }
    }

    return json({ ok: true, notified });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
