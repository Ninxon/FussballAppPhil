import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey' };
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
      return json({ error: 'Nur Admins dürfen die E-Mail ändern' }, 403);
    }

    const { customerId, email } = await req.json();
    if (!customerId) return json({ error: 'customerId fehlt' }, 400);
    if (!email || typeof email !== 'string') return json({ error: 'E-Mail fehlt' }, 400);
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return json({ error: 'Ungültige E-Mail-Adresse' }, 400);
    }

    // Auth-User zuerst aktualisieren — schlägt das fehl (z. B. E-Mail bereits
    // vergeben), darf das Profil nicht abweichen.
    const { error: authError } = await serviceClient.auth.admin.updateUserById(customerId, {
      email: normalized,
      email_confirm: true,
    });
    if (authError) {
      const taken = authError.message?.toLowerCase().includes('already');
      return json({ error: taken ? 'Diese E-Mail-Adresse ist bereits vergeben.' : authError.message }, 400);
    }

    const { error: profileError } = await serviceClient
      .from('profiles')
      .update({ email: normalized })
      .eq('id', customerId);
    if (profileError) return json({ error: `Profil aktualisieren fehlgeschlagen: ${profileError.message}` }, 500);

    return json({ ok: true, email: normalized });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
