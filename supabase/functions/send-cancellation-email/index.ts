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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { name, date, time, program } = await req.json();
  const email = user.email;
  if (!email) {
    return new Response(JSON.stringify({ error: 'Keine E-Mail-Adresse hinterlegt' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const programName = PROGRAM_NAMES[program] ?? 'Training';

  const safeName = (name ?? '').replace(/[<>]/g, '').slice(0, 100);
  const safeTime = (time ?? '').replace(/[^0-9:]/g, '');
  const rawDate = (date ?? '').replace(/[^0-9-]/g, '');
  const dateParts = rawDate.split('-');
  const safeDate = dateParts.length === 3
    ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`
    : rawDate;

  const rows: EmailRow[] = [
    { label: 'Leistung', value: programName },
    { label: 'Datum', value: safeDate },
    { label: 'Uhrzeit', value: `${safeTime} Uhr` },
  ];

  const html = renderEmailLayout({
    title: 'Stornierungsbestätigung',
    accentColor: BRAND_COLORS.accentRed,
    preheader: `Deine ${programName}-Buchung wurde storniert.`,
    greeting: `Hallo ${safeName},`,
    intro: 'deine Trainingseinheit wurde erfolgreich storniert.',
    rows,
    outro: 'Möchtest du einen neuen Termin buchen? Öffne einfach die App.',
    signOff: 'Bis bald!',
  });

  await transporter.sendMail({
    from: FROM_HEADER,
    to: email,
    subject: `Stornierungsbestätigung – ${programName}`,
    html,
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
