import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  };
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

Deno.serve(async (req) => {
  const cors = corsHeaders();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

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

    // Aufrufenden Admin verifizieren
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
      return json({ error: 'Nur Admins dürfen Kunden anlegen' }, 403);
    }

    const { email, full_name, phone, birth_date, address, parent_name, player_type, location, role, trainer_specialty, parent_id, level } = await req.json();

    // ── Modus (b): Geschwister zu bestehendem Elternteil hinzufuegen ────────
    // Kein neuer Auth-User/Passwort — nur eine weitere players-Zeile.
    if (role !== 'trainer' && parent_id) {
      if (!full_name?.trim()) return json({ error: 'Name ist ein Pflichtfeld' }, 400);

      const { data: parent } = await serviceClient
        .from('profiles').select('id, role').eq('id', parent_id).single();
      if (!parent || parent.role !== 'customer') {
        return json({ error: 'Elternteil nicht gefunden' }, 400);
      }

      const { data: sibling, error: siblingError } = await serviceClient
        .from('players')
        .insert({
          parent_id,
          name: full_name.trim(),
          birth_date: birth_date?.trim() || null,
          player_type: player_type || null,
          location: location?.trim() || null,
          level: level || null,
          is_active: true,
        })
        .select('player_number')
        .single();
      if (siblingError) return json({ error: siblingError.message }, 500);

      return json({ customer_number: sibling.player_number, player_number: sibling.player_number });
    }

    if (!email?.trim() || !full_name?.trim()) {
      return json({ error: 'E-Mail und Name sind Pflichtfelder' }, 400);
    }

    const accountRole: string = role === 'trainer' ? 'trainer' : 'customer';
    const tempPassword = generateTempPassword();

    // Auth-User anlegen
    const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
      email: email.trim(),
      password: tempPassword,
      email_confirm: true,
    });
    if (authError || !authData.user) {
      // Doppelte E-Mail (z. B. Geschwister mit gleicher Eltern-Adresse) ist ein
      // Eingabefehler, kein Serverfehler -> klare Meldung + 409 statt 500.
      const isDuplicate =
        (authError as { code?: string } | null)?.code === 'email_exists' ||
        authError?.status === 422 ||
        /already.*registered|already.*exist/i.test(authError?.message ?? '');
      if (isDuplicate) {
        return json(
          {
            error:
              'Diese E-Mail-Adresse ist bereits vergeben. Für Geschwister bitte eine eigene Adresse verwenden, z. B. eltern+name@gmail.com (kommt im selben Postfach an).',
          },
          409,
        );
      }
      return json({ error: authError?.message ?? 'Fehler beim Anlegen des Nutzers' }, 500);
    }

    // Profil anlegen. Beim Eltern-Account ist full_name der Elternteil
    // (parent_name bevorzugt, sonst der eingegebene Name); spielerspezifische
    // Felder (birth_date/player_type/location/level) leben auf players.
    const parentFullName = accountRole === 'customer'
      ? (parent_name?.trim() || full_name.trim())
      : full_name.trim();

    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .insert({
        id: authData.user.id,
        full_name: parentFullName,
        email: email.trim(),
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        parent_name: parent_name?.trim() || null,
        role: accountRole,
        is_active: true,
        ...(accountRole === 'trainer' && trainer_specialty ? { trainer_specialty } : {}),
      })
      .select('customer_number')
      .single();

    if (profileError) {
      // Auth-User zurückrollen falls Profil fehlschlägt
      await serviceClient.auth.admin.deleteUser(authData.user.id);
      return json({ error: profileError.message }, 500);
    }

    // Eltern-Account: erste players-Zeile (das Kind) anlegen.
    let resultNumber: number | null = profile.customer_number;
    if (accountRole === 'customer') {
      const { data: firstPlayer, error: playerError } = await serviceClient
        .from('players')
        .insert({
          parent_id: authData.user.id,
          name: full_name.trim(),
          birth_date: birth_date?.trim() || null,
          player_type: player_type || null,
          location: location?.trim() || null,
          level: level || null,
          is_active: true,
        })
        .select('player_number')
        .single();
      if (playerError) {
        await serviceClient.auth.admin.deleteUser(authData.user.id);
        return json({ error: playerError.message }, 500);
      }
      resultNumber = firstPlayer.player_number;
    }

    return json({ temp_password: tempPassword, customer_number: resultNumber, player_number: resultNumber });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
