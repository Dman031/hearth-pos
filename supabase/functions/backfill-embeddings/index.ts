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
// FORCE-ALL mode ({ "force_all": true }): re-embeds EVERY card regardless of
// existing vector, paged by an id cursor ({ "after_id": "<uuid>" } → response
// { next_cursor }). Re-invoke with the returned next_cursor until it is null.
// Needed when composeEmbeddingText changes (e.g. the Day 15 reserved-field
// exclusion that drops media_url / gallery_image URLs from the embedded text):
// already-embedded rows do NOT match the stale filter, so only a forced pass
// rewrites their now-cleaner vectors.
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

  // Parse optional force-all + cursor from the body (both optional; absent body
  // is fine and keeps the default stale-only behaviour).
  let forceAll = false;
  let afterId = '';
  try {
    const body: unknown = await req.json();
    if (body && typeof body === 'object') {
      const b = body as { force_all?: unknown; after_id?: unknown };
      forceAll = b.force_all === true;
      afterId = typeof b.after_id === 'string' ? b.after_id : '';
    }
  } catch {
    // No/!JSON body → defaults (stale-only, no cursor). Not an error.
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // FORCE-ALL: every card, ordered by id, paged by the id cursor. Otherwise the
  // STALE set: no vector yet, or no stamp (write-failure / pre-column rows) — a
  // set that naturally shrinks as rows get embedded, so no cursor is needed.
  let query = supabase.from('cards').select('id, title, fields');
  if (forceAll) {
    query = query.order('id', { ascending: true });
    if (afterId) query = query.gt('id', afterId);
  } else {
    query = query.or('embedding.is.null,embedding_model.is.null');
  }
  const { data, error } = await query.limit(BATCH);

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

  // Force-all pages by cursor: hand back the last id so the caller can continue
  // (null when this batch didn't fill → done). Stale mode shrinks on its own, so
  // it reports the legacy 'more' / 0 signal and no cursor.
  const filled = cards.length === BATCH;
  const nextCursor =
    forceAll && filled ? cards[cards.length - 1].id : null;
  const remaining = forceAll ? (filled ? 'more' : 0) : filled ? 'more' : 0;
  console.log('[backfill-embeddings]', {
    user_id: userId,
    mode: forceAll ? 'force_all' : 'stale',
    processed: cards.length,
    embedded,
    failed,
    remaining,
    next_cursor: nextCursor,
  });
  return jsonResponse({
    processed: cards.length,
    embedded,
    failed,
    remaining,
    next_cursor: nextCursor,
  });
});
