import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer';
import { renderEmailLayout, BRAND_COLORS, FROM_HEADER, EmailRow } from '../_shared/email-template.ts';

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey' };
}

const PROGRAM_NAMES: Record<string, string> = {
  individual:           'Individualtraining',
  gruppe:               'Gruppentraining',
  athletik:             'Athletiktraining',
  torhueter_individual: 'Torwart Individual',
  torhueter_gruppe:     'Torwart Gruppe',
};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: Deno.env.get('GMAIL_USER'),
    pass: Deno.env.get('GMAIL_PASS'),
  },
});

Deno.serve(async (req) => {
  const cors = corsHeaders();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Aufrufenden Admin verifizieren (Mail geht an den KUNDEN, nicht an den Aufrufer,
    // daher reicht die Caller-E-Mail nicht — wir lösen serverseitig auf).
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
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();
    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Nur Admins dürfen Storno-Mails versenden' }, 403);
    }

    const { appointmentId, reason } = await req.json();
    if (!appointmentId || typeof appointmentId !== 'string') {
      return json({ error: 'appointmentId fehlt' }, 400);
    }

    // Termin + Kunde serverseitig auflösen (nicht vom Client vertrauen).
    const { data: appt, error: apptError } = await serviceClient
      .from('appointments')
      .select('id, user_id, date, time, program, location')
      .eq('id', appointmentId)
      .single();
    if (apptError || !appt) return json({ error: 'Termin nicht gefunden' }, 404);

    const { data: { user: customer } } = await serviceClient.auth.admin.getUserById(appt.user_id);
    if (!customer?.email) {
      return json({ error: 'Keine E-Mail-Adresse für diesen Kunden hinterlegt' }, 400);
    }

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name')
      .eq('id', appt.user_id)
      .single();

    const programName = PROGRAM_NAMES[appt.program as string] ?? 'Training';
    const safeName = (profile?.full_name ?? '').replace(/[<>]/g, '').slice(0, 100);
    const safeTime = (appt.time as string).slice(0, 5);
    const dateParts = (appt.date as string).split('-');
    const safeDate = dateParts.length === 3
      ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`
      : (appt.date as string);
    const safeLocation = (appt.location ?? '').replace(/[<>]/g, '').slice(0, 40);
    const safeReason = typeof reason === 'string'
      ? reason.replace(/[<>]/g, '').trim().slice(0, 300)
      : '';

    const rows: EmailRow[] = [
      { label: 'Leistung', value: programName },
      { label: 'Datum', value: safeDate },
      { label: 'Uhrzeit', value: `${safeTime} Uhr` },
    ];
    if (safeLocation) rows.push({ label: 'Standort', value: safeLocation });
    if (safeReason) rows.push({ label: 'Grund', value: safeReason });

    const html = renderEmailLayout({
      title: 'Termin storniert',
      accentColor: BRAND_COLORS.accentRed,
      preheader: `Dein ${programName} am ${safeDate} wurde storniert.`,
      greeting: `Hallo ${safeName},`,
      intro: 'dein folgender Trainingstermin wurde von der PK Fussballschule storniert:',
      rows,
      outro: 'Du kannst jederzeit einen neuen Termin in der App buchen. Bei Fragen antworte einfach auf diese E-Mail.',
      signOff: 'Bis bald!',
    });

    await transporter.sendMail({
      from: FROM_HEADER,
      to: customer.email,
      subject: `Termin storniert – ${programName}`,
      html,
    });

    return json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
