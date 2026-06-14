// supabase/functions/backfill-embeddings/index.ts
//
// One-time / ops backfill: embeds cards that have no current embedding — the
// ~3 cards that predate the embedding column, any card whose write-time embed
// failed, and (after a deliberate model change) rows whose embedding_model no
// longer matches the pinned EMBED_STAMP.
//
// Selects stale cards (embedding IS NULL OR embedding_model IS NULL), embeds
// each via Cloudflare Workers AI REST, and writes embedding + embedding_model
// with the service-role key. Processes up to BATCH per invocation (Workers/edge
// subrequest budget) — re-invoke until { remaining: 0 }.
//
// JWT-gated (an ops action, not public). Mirrors embed-card's env + auth.
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { embedAndStore, type EmbeddableCard } from '../_shared/embed-core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CF_ACCOUNT_ID = Deno.env.get('CF_ACCOUNT_ID');
const CF_AI_API_TOKEN = Deno.env.get('CF_AI_API_TOKEN');

// Cards embedded per invocation — bounded so one call stays within the edge
// subrequest/CPU budget. Re-invoke until remaining === 0.
const BATCH = 25;

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

async function verifyUser(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    if (error) console.warn('[backfill-embeddings] auth.getUser failed:', error);
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

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // Stale = no vector yet, or no stamp (write-failure / pre-column rows).
  const { data, error } = await supabase
    .from('cards')
    .select('id, title, fields')
    .or('embedding.is.null,embedding_model.is.null')
    .limit(BATCH);

  if (error) {
    console.warn('[backfill-embeddings] select failed:', error.message);
    return jsonResponse({ error: 'select_failed' }, 500);
  }

  const cards = (Array.isArray(data) ? data : []) as EmbeddableCard[];
  let embedded = 0;
  let failed = 0;
  for (const card of cards) {
    const ok = await embedAndStore(supabase, card, CF_ACCOUNT_ID!, CF_AI_API_TOKEN!);
    if (ok) embedded += 1;
    else failed += 1;
  }

  // If this batch filled, there are likely more stale rows — caller re-invokes.
  const remaining = cards.length === BATCH ? 'more' : 0;
  console.log('[backfill-embeddings]', {
    user_id: userId,
    processed: cards.length,
    embedded,
    failed,
    remaining,
  });
  return jsonResponse({ processed: cards.length, embedded, failed, remaining });
});
