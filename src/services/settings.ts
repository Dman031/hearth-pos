// src/services/settings.ts
//
// Account settings the owner can change about themselves.
//
// EMAIL PREFERENCE (hearth-network migration 0043, ruling E-10). The column
// entities.email_opt_out_at has EXACTLY ONE WRITER — the set_email_preference
// RPC — and ruling N-7 makes that binding on this app: EntityContext's
// updateEntity() could write the column and MUST NOT be used for it. A second
// write path for the same column is the thing the single-canonical-write-path
// rule exists to prevent.
//
// The RPC takes no argument naming WHOSE preference it is; current_entity_id()
// derives that from the session, which is what makes it impossible to set
// someone else's. It returns {"enabled": bool} — the state as stored, which is
// what the caller should render, not the value it optimistically hoped for.
//
// WHAT THE PREFERENCE GOVERNS, and the list is the whole set (E-2 / E-2a):
// requests, confirmations, reminders and cancellations. There is no marketing
// send, so this is never a "subscription", "newsletter" or "notifications"
// setting. Turning it off is honoured immediately — the sender re-reads the
// column at send time, so a row already queued is skipped rather than
// delivered.
//
// Vendor-facing copy lives in the screen (SettingsPanel), never here.

import { supabase } from './supabase';

export type EmailPreferenceResult =
  | { ok: true; enabled: boolean }
  | { ok: false; reason: EmailPreferenceFailure };

export type EmailPreferenceFailure =
  | 'unauthenticated' // no signed-in owner / no usable session
  | 'request_failed'; // network, RLS, or any unclassified server failure

/**
 * Sets whether the owner receives transactional mail about their visits.
 * `true` = receive (the default, which is email_opt_out_at being null).
 *
 * Resolves nothing client-side and never throws. Returns the state the SERVER
 * reports, so a caller renders what is stored rather than what it asked for.
 */
export async function setEmailPreference(
  enabled: boolean,
): Promise<EmailPreferenceResult> {
  const { data, error } = await supabase.rpc('set_email_preference', {
    p_enabled: enabled,
  });

  if (error) {
    const message = typeof error.message === 'string' ? error.message : '';
    const code = typeof error.code === 'string' ? error.code : '';
    // No/expired JWT is rejected by PostgREST before the function ever runs.
    const reason: EmailPreferenceFailure =
      code === 'PGRST301' || code === '401' || /\bJWT\b/i.test(message)
        ? 'unauthenticated'
        : 'request_failed';
    console.warn('[settings] set_email_preference failed:', {
      reason,
      enabled,
      error,
    });
    return { ok: false, reason };
  }

  // The contract is {"enabled": bool}. Anything else means the contract moved —
  // fail loudly rather than casting a surprise into a success.
  const returned =
    data && typeof data === 'object' && typeof (data as { enabled?: unknown }).enabled === 'boolean'
      ? (data as { enabled: boolean }).enabled
      : null;
  if (returned === null) {
    console.warn('[settings] set_email_preference returned an unexpected value:', data);
    return { ok: false, reason: 'request_failed' };
  }

  console.log('[settings] email preference set', { enabled: returned });
  return { ok: true, enabled: returned };
}
