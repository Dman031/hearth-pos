// supabase/functions/embed-card/index.ts
//
// Embeds ONE card for semantic search (Tier 3). Called by hearth-pos
// CardContext.createCard right after a card is inserted (and by the Day 11-12
// editor when card text changes). Computes the embedding server-side via
// Cloudflare Workers AI REST and stores it on cards.embedding (+ the
// embedding_model stamp) using the service-role key — the vector never touches
// the client.
//
// Why server-side: the CF API token lives in this function's secrets
// (CF_AI_API_TOKEN), never in the app bundle. Mirrors the generate-followup
// edge-fn pattern (raw fetch, JWT-gated).
//
// NON-FATAL by contract: the caller fires-and-forgets. Any failure returns 200
// with { embedded: false } — the card already exists and stays findable via the
// network's substring fallback; the backfill re-embeds it later. Never blocks
// card creation.
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { embedAndStore } from '../_shared/embed-core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CF_ACCOUNT_ID = Deno.env.get('CF_ACCOUNT_ID');
const CF_AI_API_TOKEN = Deno.env.get('CF_AI_API_TOKEN');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars (auto-injected by the Edge runtime).');
}
if (!CF_ACCOUNT_ID || !CF_AI_API_TOKEN) {
  throw new Error(
    'Missing Cloudflare env. Run `supabase secrets set CF_ACCOUNT_ID=... CF_AI_API_TOKEN=...`.',
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Verifies the caller's JWT and returns their user id, or null. */
async function verifyUser(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    if (error) console.warn('[embed-card] auth.getUser failed:', error);
    return null;
  }
  return data.user.id;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const userId = await verifyUser(req.headers.get('authorization'));
  if (!userId) {
    return jsonResponse({ error: 'unauthenticated' }, 401);
  }

  let cardId: string;
  try {
    const body: unknown = await req.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as { card_id?: unknown }).card_id !== 'string'
    ) {
      return jsonResponse({ error: 'invalid_body' }, 400);
    }
    cardId = (body as { card_id: string }).card_id;
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // Load the card + its owner, and confirm the caller owns it (the card's entity
  // must belong to this user). embed-card only writes a vector, but gating it
  // keeps a signed-in user from triggering embeds on cards they don't own.
  const { data: card, error: loadErr } = await supabase
    .from('cards')
    .select('id, title, fields, entities!inner(user_id)')
    .eq('id', cardId)
    .maybeSingle();

  if (loadErr) {
    console.warn('[embed-card] card load failed:', loadErr.message);
    return jsonResponse({ embedded: false, reason: 'load_failed' });
  }
  if (!card) {
    return jsonResponse({ embedded: false, reason: 'not_found' });
  }

  const ownerUserId = (card as { entities?: { user_id?: string | null } }).entities?.user_id ?? null;
  if (ownerUserId !== userId) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  const ok = await embedAndStore(
    supabase,
    { id: cardId, title: (card as { title: string }).title, fields: (card as { fields: unknown }).fields },
    CF_ACCOUNT_ID!,
    CF_AI_API_TOKEN!,
  );

  console.log('[embed-card]', { user_id: userId, card_id: cardId, embedded: ok });
  return jsonResponse({ embedded: ok });
});
