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
      return json({ error: 'Nur Admins dürfen Kunden archivieren' }, 403);
    }

    const { customerId } = await req.json();
    if (!customerId) return json({ error: 'customerId fehlt' }, 400);

    // players/appointments/tokens haengen per ON DELETE CASCADE am Eltern-Account
    // (auth.users -> profiles -> players -> appointments/tokens). Das Loeschen des
    // Auth-Users raeumt sie automatisch ab — kein manuelles Vorab-Loeschen noetig.
    const notifUpd = await serviceClient.from('notifications').update({ created_by: null }).eq('created_by', customerId);
    if (notifUpd.error) return json({ error: `Benachrichtigungen bereinigen fehlgeschlagen: ${notifUpd.error.message}` }, 500);

    const trainerRefUpd = await serviceClient.from('appointments').update({ trainer_id: null }).eq('trainer_id', customerId);
    if (trainerRefUpd.error) return json({ error: `Trainer-Referenzen bereinigen fehlgeschlagen: ${trainerRefUpd.error.message}` }, 500);

    const { error: authError } = await serviceClient.auth.admin.deleteUser(customerId);
    if (authError) {
      // If the auth user is already gone, still clean up the profile and succeed
      const notFound = authError.status === 404 || authError.message?.toLowerCase().includes('not found');
      if (!notFound) return json({ error: authError.message }, 500);
      await serviceClient.from('profiles').delete().eq('id', customerId);
    }

    return json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
