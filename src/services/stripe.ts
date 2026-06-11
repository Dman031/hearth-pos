// src/services/stripe.ts
//
// Stripe integration for hearth-pos. TODAY this file covers ONE thing:
// kicking off Stripe Identity hosted verification (government document + selfie)
// so a vendor can become a "verified human".
//
// Privacy contract (non-negotiable): this app NEVER receives, stores, or
// transmits the identity document or selfie. Stripe collects and holds the
// document; we store ONLY the verdict — the boolean `entities.id_verified`,
// flipped server-side by the `stripe-identity-webhook` Edge Function. Nothing
// in this client path touches the underlying PII.
//
// Why a server hop: creating a VerificationSession requires the Stripe SECRET
// key, which must never ship in the client bundle. So we mirror the
// classify-business pattern — the secret lives in the `create-identity-session`
// Edge Function's secrets, the client invokes it with the vendor's JWT, and we
// open the returned Stripe-hosted URL.
//
// Trigger timing: this is invoked JUST-IN-TIME — when a vendor declares a card
// that needs the verified tier (wired in Phase 4) or taps "Verify your
// identity" on the Profile tab — NOT at signup. This module only exposes the
// starter; it never auto-fires.
//
// Return UX caveat: app.json has no custom `scheme` yet, so there is no
// deep-link `return_url` back into the app. The vendor completes verification
// in the system browser and returns manually; the webhook is the source of
// truth, and ProfileScreen refreshes the entity on focus to reflect the new
// verdict. When a scheme is added, pass a `return_url` here for a smoother hop.

import * as Linking from 'expo-linking';
import { supabase } from './supabase';

/** Edge Function that creates the VerificationSession (holds the secret key). */
const CREATE_SESSION_FUNCTION = 'create-identity-session';

/**
 * Result of attempting to start hosted Identity verification. Discriminated so
 * the caller can branch without try/catch — this path is vendor-initiated, so
 * failures must surface as a visible state, never a silent no-op.
 */
export type IdentityVerificationStart =
  | { ok: true; sessionId: string }
  | { ok: false; reason: IdentityStartFailure };

export type IdentityStartFailure =
  | 'unauthenticated' // no Supabase session — vendor must be signed in
  | 'session_create_failed' // edge function errored or returned a bad payload
  | 'cannot_open_browser'; // device refused to open the hosted URL

interface CreateSessionPayload {
  url: string;
  id: string;
}

/** Validates the edge function's JSON before we trust it. */
function parseSessionPayload(data: unknown): CreateSessionPayload | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const { url, id } = data as Record<string, unknown>;
  if (typeof url !== 'string' || url.length === 0) {
    return null;
  }
  if (typeof id !== 'string' || id.length === 0) {
    return null;
  }
  return { url, id };
}

/**
 * Starts Stripe Identity hosted verification for the signed-in vendor.
 *
 * Flow: invoke `create-identity-session` (which creates the VerificationSession
 * server-side, stamping the caller's entity_id into metadata) → open the
 * Stripe-hosted `url` in the system browser. The verdict comes back via the
 * `stripe-identity-webhook` Edge Function, which flips `entities.id_verified`.
 *
 * Never throws — returns a discriminated result so the UI always has a state to
 * render.
 */
export async function startIdentityVerification(): Promise<IdentityVerificationStart> {
  // Require a live session up front. The edge function re-checks the JWT, but
  // failing fast here gives the UI a precise reason without a round trip.
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) {
    console.warn('[stripe] getSession failed:', sessionError);
    return { ok: false, reason: 'unauthenticated' };
  }
  if (!sessionData.session) {
    console.warn('[stripe] startIdentityVerification called with no session');
    return { ok: false, reason: 'unauthenticated' };
  }

  let payload: CreateSessionPayload | null;
  try {
    const { data, error } = await supabase.functions.invoke(
      CREATE_SESSION_FUNCTION,
      { body: {} },
    );
    if (error) {
      console.warn('[stripe] create-identity-session failed:', error);
      return { ok: false, reason: 'session_create_failed' };
    }
    payload = parseSessionPayload(data);
    if (payload === null) {
      console.warn(
        '[stripe] create-identity-session returned malformed payload:',
        data,
      );
      return { ok: false, reason: 'session_create_failed' };
    }
  } catch (err) {
    console.warn('[stripe] create-identity-session invoke threw:', err);
    return { ok: false, reason: 'session_create_failed' };
  }

  // Open the Stripe-hosted verification page in the system browser.
  try {
    const canOpen = await Linking.canOpenURL(payload.url);
    if (!canOpen) {
      console.warn('[stripe] device cannot open hosted URL:', payload.url);
      return { ok: false, reason: 'cannot_open_browser' };
    }
    await Linking.openURL(payload.url);
  } catch (err) {
    console.warn('[stripe] failed to open hosted verification URL:', err);
    return { ok: false, reason: 'cannot_open_browser' };
  }

  console.log('[stripe] opened Identity verification session', {
    sessionId: payload.id,
  });
  return { ok: true, sessionId: payload.id };
}
