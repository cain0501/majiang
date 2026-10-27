import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyOp, defaultState, normalizeState } from './core.js';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, apikey',
  'cache-control': 'no-store'
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders }
  });
}

function groupOf(request: Request) {
  const group = new URL(request.url).searchParams.get('g') || 'main';
  return group.slice(0, 80) || 'main';
}

async function readState(groupId: string) {
  const { data, error } = await supabase
    .from('majiang_states')
    .select('state')
    .eq('group_id', groupId)
    .maybeSingle();
  if (error) throw error;
  return data?.state ? normalizeState(data.state, Date.now()) : defaultState();
}

async function writeState(groupId: string, state: unknown) {
  const { error } = await supabase.from('majiang_states').upsert({
    group_id: groupId,
    state,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

Deno.serve(async request => {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (!url.pathname.endsWith('/majiang-api')) return json({ error: 'not found' }, 404);

  try {
    const groupId = groupOf(request);
    if (request.method === 'GET') {
      const state = await readState(groupId);
      await writeState(groupId, state);
      return json(state);
    }
    if (request.method === 'POST') {
      let op: unknown;
      try { op = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const state = await readState(groupId);
      const next = applyOp(state, op, Date.now());
      await writeState(groupId, next);
      return json(next);
    }
    return json({ error: 'method not allowed' }, 405);
  } catch (error) {
    return json({ error: String(error instanceof Error ? error.message : error) }, 500);
  }
});
