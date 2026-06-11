// supabase/functions/stripe-identity-webhook/index.ts
//
// Receives Stripe Identity webhook events and flips `entities.id_verified` when
// a verification succeeds. This is the SOURCE OF TRUTH for the verdict — the
// client never writes id_verified.
//
// Security model: Stripe cannot present a Supabase JWT, so this function is
// deployed with `verify_jwt = false` (see supabase/config.toml). It is instead
// authenticated by the Stripe webhook SIGNATURE — every request must carry a
// valid `stripe-signature` header verified against STRIPE_IDENTITY_WEBHOOK_SECRET.
// An unsigned or mis-signed request is rejected with 400 and writes nothing.
//
// Privacy: the event payload for identity.verification_session.* contains only
// status/metadata — never the document image or extracted PII (those require a
// separate, explicit VerificationReport fetch we deliberately never make). We
// read `metadata.entity_id` and the verified status, and write a single boolean.
//
// Idempotent: Stripe retries deliveries. Flipping id_verified=true repeatedly is
// harmless; we update by primary key and treat zero-rows as a logged failure
// (RLS does not apply to the service role, so zero rows means the entity_id no
// longer exists — worth surfacing, not silently swallowing).
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_IDENTITY_WEBHOOK_SECRET = Deno.env.get(
  'STRIPE_IDENTITY_WEBHOOK_SECRET',
);

if (!STRIPE_SECRET_KEY) {
  throw new Error(
    'Missing STRIPE_SECRET_KEY. Run `supabase secrets set STRIPE_SECRET_KEY=sk_test_...`.',
  );
}
if (!STRIPE_IDENTITY_WEBHOOK_SECRET) {
  throw new Error(
    'Missing STRIPE_IDENTITY_WEBHOOK_SECRET. Run ' +
      '`supabase secrets set STRIPE_IDENTITY_WEBHOOK_SECRET=whsec_...` ' +
      '(the signing secret of the Identity webhook endpoint in the Stripe dashboard).',
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

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } });
}

/** Extracts a string entity_id from a Stripe object's metadata, or null. */
function entityIdFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const value = (metadata as Record<string, unknown>).entity_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Flips id_verified=true for one entity via the service role. Chains .select()
 * so we can confirm a row was actually affected — zero rows on a PK match means
 * the entity_id is stale/missing and MUST be treated as failure, not success.
 */
async function markEntityVerified(entityId: string): Promise<void> {
  const client = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await client
    .from('entities')
    .update({ id_verified: true })
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
  console.log('[stripe-identity-webhook] id_verified=true for', entityId);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return textResponse('method_not_allowed', 405);
  }

  // 1. Verify the Stripe signature. The raw body is required — do not parse
  //    before this. constructEventAsync uses WebCrypto (Node's sync variant is
  //    unavailable in Deno).
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    console.warn('[stripe-identity-webhook] missing stripe-signature header');
    return textResponse('missing_signature', 400);
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      STRIPE_IDENTITY_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.warn('[stripe-identity-webhook] signature verification failed:', err);
    return textResponse('invalid_signature', 400);
  }

  // 2. Act only on a successful verification. Other events (requires_input,
  //    processing, canceled) are acknowledged with 200 so Stripe stops
  //    retrying, but they do not flip the flag.
  if (event.type === 'identity.verification_session.verified') {
    const sessionObj = event.data.object as Stripe.Identity.VerificationSession;
    const entityId = entityIdFromMetadata(sessionObj.metadata);
    if (!entityId) {
      console.warn(
        '[stripe-identity-webhook] verified event has no entity_id metadata; session',
        sessionObj.id,
      );
      // Nothing to write, but ack so Stripe does not retry indefinitely.
      return textResponse('no_entity_metadata', 200);
    }
    try {
      await markEntityVerified(entityId);
    } catch (err) {
      // Return 500 so Stripe retries — the verdict is real, the write failed.
      console.error('[stripe-identity-webhook] failed to record verdict:', err);
      return textResponse('write_failed', 500);
    }
    return textResponse('ok', 200);
  }

  console.log('[stripe-identity-webhook] ignored event type', event.type);
  return textResponse('ignored', 200);
});
