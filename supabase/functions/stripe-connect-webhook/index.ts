// supabase/functions/stripe-connect-webhook/index.ts
//
// Receives Stripe Connect webhook events and flips entities.business_verified
// when a connected (Express) account completes KYB. This is the SOURCE OF TRUTH
// for business verification — the client never writes business_verified.
//
// Security: Stripe cannot present a Supabase JWT, so verify_jwt = false (see
// supabase/config.toml). Every request is instead authenticated by the Stripe
// webhook SIGNATURE against STRIPE_CONNECT_WEBHOOK_SECRET — a DISTINCT secret
// from the Identity webhook (this endpoint listens to Connect `account.updated`).
//
// "Verified" definition: an Express account has cleared KYB when it has
// submitted details, charges are enabled, and there is no disabling requirement
// reason. We read only that status + metadata.entity_id; no PII is fetched.
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// npm: specifier, NOT esm.sh ?target=deno — the esm.sh deno build polyfills
// Node builtins via deno.land/std@0.177.1/node, which the current Edge runtime
// removed (crashes with "Deno.core.runMicrotasks() is not supported").
import Stripe from 'npm:stripe@17.5.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_CONNECT_WEBHOOK_SECRET = Deno.env.get(
  'STRIPE_CONNECT_WEBHOOK_SECRET',
);

if (!STRIPE_SECRET_KEY) {
  throw new Error(
    'Missing STRIPE_SECRET_KEY. Run `supabase secrets set STRIPE_SECRET_KEY=sk_test_...`.',
  );
}
if (!STRIPE_CONNECT_WEBHOOK_SECRET) {
  throw new Error(
    'Missing STRIPE_CONNECT_WEBHOOK_SECRET. Run ' +
      '`supabase secrets set STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...` ' +
      '(the signing secret of the Connect webhook endpoint in the Stripe dashboard).',
  );
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing Supabase env vars (these are auto-injected by the Edge runtime).',
  );
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: '2024-12-18.acacia',
});

// Web Crypto-based signature verification — the Edge runtime guarantees
// SubtleCrypto; Node crypto compat is best-effort there.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } });
}

/** Extracts a string entity_id from a Stripe object's metadata, or null. */
function entityIdFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const value = (metadata as Record<string, unknown>).entity_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** KYB cleared: details submitted, charges enabled, no disabling requirement. */
function isBusinessVerified(account: Stripe.Account): boolean {
  const disabledReason = account.requirements?.disabled_reason ?? null;
  return (
    account.details_submitted === true &&
    account.charges_enabled === true &&
    disabledReason === null
  );
}

/** Flips business_verified=true via the service role, .select()-confirmed. */
async function markBusinessVerified(entityId: string): Promise<void> {
  const client = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await client
    .from('entities')
    .update({ business_verified: true })
    .eq('id', entityId)
    .select('id');

  if (error) {
    throw new Error(`entities update failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      `entities update affected no rows for entity_id=${entityId} ` +
        '(entity missing — verdict could not be recorded)',
    );
  }
  console.log('[stripe-connect-webhook] business_verified=true for', entityId);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return textResponse('method_not_allowed', 405);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    console.warn('[stripe-connect-webhook] missing stripe-signature header');
    return textResponse('missing_signature', 400);
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      STRIPE_CONNECT_WEBHOOK_SECRET!,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.warn('[stripe-connect-webhook] signature verification failed:', err);
    return textResponse('invalid_signature', 400);
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    if (!isBusinessVerified(account)) {
      // KYB not complete yet — ack so Stripe doesn't retry; flag stays false.
      return textResponse('not_yet_verified', 200);
    }
    const entityId = entityIdFromMetadata(account.metadata);
    if (!entityId) {
      console.warn(
        '[stripe-connect-webhook] verified account has no entity_id metadata; account',
        account.id,
      );
      return textResponse('no_entity_metadata', 200);
    }
    try {
      await markBusinessVerified(entityId);
    } catch (err) {
      console.error('[stripe-connect-webhook] failed to record verdict:', err);
      return textResponse('write_failed', 500); // 500 → Stripe retries
    }
    return textResponse('ok', 200);
  }

  console.log('[stripe-connect-webhook] ignored event type', event.type);
  return textResponse('ignored', 200);
});
