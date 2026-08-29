/**
 * Verification — one row of get_my_verifications(). Shape is authoritative per
 * hearth-network migration **0036 SECTION 1**, which DROPPED and recreated the
 * function with eleven columns. Do NOT add app-only fields — derive display
 * state in hooks/components.
 *
 * MIRROR THE DATABASE, NEVER A DOCUMENT ABOUT IT. This file previously mirrored
 * the CRED S3 spec's contract table, which was frozen at 0035; the two then
 * agreed with each other while both disagreed with the live schema, and a
 * session was nearly spent building an RPC for a column that already existed.
 * See DEUS_DAY_BY_DAY.md N-6-CORRECTED. When this shape is in doubt, read the
 * migration, not the spec.
 *
 * The helper is owner-scoped server-side (current_entity_id()). The `snapshot`
 * column — the verbatim primary-source payload — is deliberately absent and
 * structurally unreachable: public.verifications has RLS enabled with NO select
 * policy, so there is no client read path to it at all. Never add it here.
 * `credential_class` is on the table and deliberately NOT returned — it is the
 * honorific entitlement, a different need; do not add it here either.
 *
 * status:
 *   pending       — the row is queued; the ceremony drains it (~1 min).
 *   verified      — the primary source confirmed an active, undisciplined
 *                   credential AND the name concorded with the identity
 *                   session. For type='license' this is what projects
 *                   entities.credential_verified.
 *   manual_review — an AUTOMATED check was inconclusive: a discipline record
 *                   that would not parse (ruling F3), an ambiguous exclusions
 *                   name hit (F7 — S2 concordance is name-only), or the
 *                   registry number is already live-bound to another entity
 *                   (R4). It does NOT mean a person has been queued to look
 *                   at it. No S2/S3 path in the app can move it to verified.
 *   voided        — a previously verified row was withdrawn; see void_reason.
 *
 * method: psv_api (direct primary-source call) | concordance | manual_fallback
 * (the archived phone-binding ceremony, service-role only — never the app).
 *
 * checked_at/expires_at are null while pending. voided_at is non-null iff
 * status is 'voided' (enforced by verifications_void_pair).
 */

/** The credential kinds a verification row can cover (0035 enum). */
export type VerificationType = 'identity' | 'npi' | 'license' | 'exclusions';

/** Lifecycle of a verification row (0035 enum). */
export type VerificationStatus = 'pending' | 'verified' | 'manual_review' | 'voided';

/** How the outcome was reached (0035 enum). */
export type VerificationMethod = 'psv_api' | 'concordance' | 'manual_fallback';

export interface Verification {
  id: string;
  type: VerificationType;
  /** nppes | oig | state_board:<ST>:<board> | vendor:<name>. NEVER rendered to
   *  a vendor — the user-facing string is "the Oregon licensing board", never
   *  the board's initials and never a vendor name (discipline rule 7). */
  source: string;
  /** npi: the 10 digits · license: '<ST>:<board>:<NUMBER>' · exclusions: the
   *  checked NPI or 'name' · identity: the Stripe vs_ id. The owner's own data,
   *  read under their own session. Parse a licence with parseLicenceRef()
   *  (services/credentials.ts) rather than splitting it at a display site. */
  registry_ref: string;
  status: VerificationStatus;
  method: VerificationMethod;
  checked_at: string | null;
  expires_at: string | null;
  monitor: boolean;
  voided_at: string | null;
  void_reason: string | null;
}
