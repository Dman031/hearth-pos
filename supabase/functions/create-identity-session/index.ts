// supabase/functions/create-identity-session/index.ts
//
// Creates a Stripe Identity VerificationSession (document + selfie) for the
// signed-in vendor and returns the Stripe-hosted URL the client opens.
//
// Why server-side: creating a VerificationSession requires the Stripe SECRET
// key, which lives ONLY in this function's secrets
// (`supabase secrets set STRIPE_SECRET_KEY=sk_test_...`), never in the client
// bundle. Same pattern as classify-business with the Anthropic key.
//
// Privacy: we collect NOTHING about the document here. We stamp the caller's
// entity_id into the session metadata so the webhook can map the verdict back
// to the right entity, and we return only `{ url, id }`. The document + selfie
// live with Stripe; this app only ever learns the boolean verdict.
//
// Auth: rejects requests without a valid Supabase user JWT — only a signed-in
// vendor can start verification for their own entity.
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

if (!STRIPE_SECRET_KEY) {
  throw new Error(
    'Missing STRIPE_SECRET_KEY. Run `supabase secrets set STRIPE_SECRET_KEY=sk_test_...`.',
  );
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing Supabase env vars (these are auto-injected by the Edge runtime).',
  );
}

// Deno-friendly Stripe client: the default Node http client is unavailable in
// the edge runtime, so use the Fetch client.
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: '2024-12-18.acacia',
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Verifies the caller's JWT and returns their auth user id, or null. */
async function verifyUser(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    if (error) {
      console.warn('[create-identity-session] auth.getUser failed:', error);
    }
    return null;
  }
  return data.user.id;
}

/** Resolves the entity id owned by `userId` via the service role (bypass RLS). */
async function resolveEntityId(userId: string): Promise<string | null> {
  const client = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await client
    .from('entities')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[create-identity-session] entity lookup failed:', error);
    return null;
  }
  if (!data || typeof data.id !== 'string') {
    return null;
  }
  return data.id;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  // 1. Only a signed-in vendor may start verification.
  const userId = await verifyUser(req.headers.get('authorization'));
  if (!userId) {
    return jsonResponse({ error: 'unauthenticated' }, 401);
  }

  // 2. Map the user to their entity — the verdict has to land on a real row.
  const entityId = await resolveEntityId(userId);
  if (!entityId) {
    console.warn('[create-identity-session] no entity for user', userId);
    return jsonResponse({ error: 'entity_not_found' }, 404);
  }

  // 3. Create the VerificationSession. `type: 'document'` collects a government
  //    ID; require_matching_selfie adds the liveness selfie. metadata.entity_id
  //    is how the webhook routes the verdict back. We store nothing here.
  try {
    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { entity_id: entityId, user_id: userId },
      options: {
        document: {
          require_matching_selfie: true,
          require_live_capture: true,
        },
      },
    });

    if (!session.url) {
      // Hosted flow always returns a url; missing one is a Stripe-side anomaly.
      console.warn('[create-identity-session] session has no hosted url');
      return jsonResponse({ error: 'session_create_failed' }, 502);
    }

    console.log('[create-identity-session]', {
      user_id: userId,
      entity_id: entityId,
      session_id: session.id,
      status: session.status,
    });

    return jsonResponse({ url: session.url, id: session.id });
  } catch (err) {
    console.error('[create-identity-session] stripe create failed:', err);
    return jsonResponse({ error: 'session_create_failed' }, 502);
  }
});
