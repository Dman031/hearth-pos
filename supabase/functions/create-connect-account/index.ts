// supabase/functions/create-connect-account/index.ts
//
// Starts BUSINESS verification for the signed-in vendor's entity using Stripe
// Connect (Express). Creates (or reuses) an Express account whose KYB onboarding
// doubles as business verification, and returns the Stripe-hosted Account Link
// the client opens. The verdict — entities.business_verified — is set later by
// the stripe-connect-webhook on `account.updated`, never here.
//
// Why server-side: creating Connect accounts requires the Stripe SECRET key,
// which lives only in this function's secrets. Mirrors create-identity-session.
//
// Account reuse: we persist the Connect account id in entity_stripe_accounts
// (POS-only, entity-keyed) so a repeat tap reuses the same account instead of
// spawning duplicates. metadata.entity_id is also stamped on the account so the
// webhook can map the verdict back even independent of that table.
//
// CONFIG NOTE: this needs Connect ENABLED on the platform account and the
// Express platform profile filled in (dashboard) — the test secret key alone is
// not enough. See the checklist handed off with this change.
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

// Where Stripe sends the vendor after finishing / refreshing onboarding. No app
// scheme exists yet (same caveat as Identity), so these are plain https returns;
// the webhook is the source of truth regardless of where the redirect lands.
const CONNECT_RETURN_URL =
  Deno.env.get('CONNECT_RETURN_URL') ?? 'https://hearth.network/connect/return';
const CONNECT_REFRESH_URL =
  Deno.env.get('CONNECT_REFRESH_URL') ?? 'https://hearth.network/connect/refresh';

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
    if (error) console.warn('[create-connect-account] auth.getUser failed:', error);
    return null;
  }
  return data.user.id;
}

/** Resolves the entity id owned by `userId` via the service role. */
async function resolveEntityId(
  svc: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await svc
    .from('entities')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[create-connect-account] entity lookup failed:', error);
    return null;
  }
  return data && typeof data.id === 'string' ? data.id : null;
}

/** Reads any existing Connect account id for the entity. */
async function existingAccountId(
  svc: ReturnType<typeof createClient>,
  entityId: string,
): Promise<string | null> {
  const { data, error } = await svc
    .from('entity_stripe_accounts')
    .select('connect_account_id')
    .eq('entity_id', entityId)
    .maybeSingle();
  if (error) {
    console.warn('[create-connect-account] account lookup failed:', error);
    return null;
  }
  return data && typeof data.connect_account_id === 'string'
    ? data.connect_account_id
    : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const userId = await verifyUser(req.headers.get('authorization'));
  if (!userId) {
    return jsonResponse({ error: 'unauthenticated' }, 401);
  }

  const svc = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const entityId = await resolveEntityId(svc, userId);
  if (!entityId) {
    console.warn('[create-connect-account] no entity for user', userId);
    return jsonResponse({ error: 'entity_not_found' }, 404);
  }

  try {
    // Reuse an existing Connect account if we have one; otherwise create and
    // persist a new Express account stamped with entity_id metadata.
    let accountId = await existingAccountId(svc, entityId);

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        business_type: 'company',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { entity_id: entityId, user_id: userId },
      });
      accountId = account.id;

      const { error: upsertError } = await svc
        .from('entity_stripe_accounts')
        .upsert(
          { entity_id: entityId, connect_account_id: accountId, updated_at: new Date().toISOString() },
          { onConflict: 'entity_id' },
        )
        .select('entity_id');
      if (upsertError) {
        // The account exists in Stripe but we failed to remember it. Surface as
        // failure rather than leak an unrecorded account on a silent no-op.
        console.error(
          '[create-connect-account] failed to persist connect account:',
          upsertError,
        );
        return jsonResponse({ error: 'account_persist_failed' }, 500);
      }
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: CONNECT_REFRESH_URL,
      return_url: CONNECT_RETURN_URL,
      type: 'account_onboarding',
    });

    console.log('[create-connect-account]', {
      user_id: userId,
      entity_id: entityId,
      account_id: accountId,
    });

    return jsonResponse({ url: link.url, account_id: accountId });
  } catch (err) {
    console.error('[create-connect-account] stripe error:', err);
    return jsonResponse({ error: 'connect_create_failed' }, 502);
  }
});
