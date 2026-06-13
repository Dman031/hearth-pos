// src/services/credentials.ts
//
// Credential (license) verification — the SUBMIT side of the manual-verify
// queue. A regulated vendor (doctor, etc.) submits a license; the row lands in
// `credential_verification_requests` with status 'pending'. Approval is manual
// and out-of-band: an admin calls the `approve_credential_request()` SQL
// function (service role), which flips entities.credential_verified. There is
// deliberately NO admin UI here and no client-side approval — a vendor can only
// create a request, never approve their own (enforced by RLS + the function's
// service-role-only EXECUTE grant).
//
// The verified VERDICT (credential_verified) is therefore never written by this
// client — only the request is.

import { supabase } from './supabase';

export interface CredentialRequestInput {
  /** e.g. 'medical_license', 'cosmetology_license' — free text for now. */
  licenseType: string;
  /** The license/registration number as issued. */
  licenseNumber: string;
}

export type CredentialRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; reason: CredentialRequestFailure };

export type CredentialRequestFailure =
  | 'unauthenticated' // no signed-in vendor
  | 'entity_not_found' // signed in but no entity row to attach the request to
  | 'invalid_input' // empty license type/number
  | 'insert_failed'; // RLS block, constraint, or other write failure

/**
 * Submits a license for manual credential verification. Resolves the caller's
 * entity, inserts a pending request, and returns its id. Never throws.
 */
export async function submitCredentialRequest(
  input: CredentialRequestInput,
): Promise<CredentialRequestResult> {
  const licenseType = input.licenseType.trim();
  const licenseNumber = input.licenseNumber.trim();
  if (licenseType.length === 0 || licenseNumber.length === 0) {
    return { ok: false, reason: 'invalid_input' };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    if (userError) console.warn('[credentials] getUser failed:', userError);
    return { ok: false, reason: 'unauthenticated' };
  }

  // Resolve the entity this request attaches to. RLS also enforces ownership on
  // insert, but resolving here gives a precise failure and the entity_id value.
  const { data: entity, error: entityError } = await supabase
    .from('entities')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (entityError) {
    console.warn('[credentials] entity lookup failed:', entityError);
    return { ok: false, reason: 'entity_not_found' };
  }
  if (!entity || typeof entity.id !== 'string') {
    return { ok: false, reason: 'entity_not_found' };
  }

  // Insert + .select() so a zero-row RLS silent block is caught as failure
  // (per the SUPABASE WRITE RULE).
  const { data: inserted, error: insertError } = await supabase
    .from('credential_verification_requests')
    .insert({
      entity_id: entity.id,
      license_type: licenseType,
      license_number: licenseNumber,
    })
    .select('id')
    .single();

  if (insertError) {
    console.warn('[credentials] request insert failed:', insertError);
    return { ok: false, reason: 'insert_failed' };
  }
  if (!inserted || typeof inserted.id !== 'string') {
    console.warn('[credentials] request insert returned no row (possible RLS block)');
    return { ok: false, reason: 'insert_failed' };
  }

  console.log('[credentials] submitted credential request', {
    requestId: inserted.id,
  });
  return { ok: true, requestId: inserted.id };
}
