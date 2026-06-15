// src/services/card-gating.ts
//
// The card permission gate. A card's HIGHER permissions (see = verified|anyone,
// act = verified) and its ability to "go live" are locked behind the card's
// `verification_required`, satisfied ONLY by the owning entity's matching
// verified flag:
//
//   verification_required → required entity flag
//   ─────────────────────────────────────────────
//   'none'    → (no gate)
//   'id'      → entities.id_verified
//   'license' → entities.credential_verified
//   'business'→ entities.business_verified
//
// This module is PURE (no IO, no React, no Supabase) so it is the single source
// of truth the future card-write path, the Phase-4 card-tier trigger, and the
// UI all call. Per CLAUDE.md's PROMPT-CODE CONTRACT, the gate is enforced in
// code at the write boundary (`assertCardCanGoLive`), not merely described in a
// prompt. A card that requires verification CANNOT go live until the entity is
// verified — `assertCardCanGoLive` throws otherwise.

import type { Entity } from '../types/entity';
import type {
  ActPerm,
  Card,
  CardDraft,
  SeePerm,
  VerificationRequired,
  VerificationStatus,
} from '../types/card';

/** The entity boolean columns a card's verification can require. */
export type VerifiedFlag = keyof Pick<
  Entity,
  'id_verified' | 'credential_verified' | 'business_verified'
>;

/** The subset of an entity the gate reads — just its three verified flags. */
export type EntityVerificationFlags = Pick<Entity, VerifiedFlag>;

/**
 * Maps a card's `verification_required` to the entity flag that satisfies it.
 * `null` means the card requires no verification.
 */
export const REQUIRED_FLAG: Record<VerificationRequired, VerifiedFlag | null> = {
  none: null,
  id: 'id_verified',
  license: 'credential_verified',
  business: 'business_verified',
};

/**
 * Whether the owning entity counts as "verified" for verified-tier purposes:
 * ANY of its verification badges is set. This folds over REQUIRED_FLAG's
 * non-null values (id_verified / credential_verified / business_verified) so it
 * stays in lockstep with the gate's flag map — and, critically, MATCHES the
 * network's verified-tier derivation (hearth-network src/middleware/auth.ts:
 * `tier = id_verified || business_verified || credential_verified ? 'verified'
 * : 'basic'`). The editor uses this to lock the 'verified' tier; if it gated on
 * id_verified alone, a business_verified vendor the network treats as verified
 * would be wrongly blocked from setting their own cards to 'verified'.
 */
export function entityIsVerified(entity: EntityVerificationFlags): boolean {
  return Object.values(REQUIRED_FLAG).some(
    (flag) => flag !== null && entity[flag] === true,
  );
}

/** A see tier that requires the owner to be verified before it can go live. */
function isHigherSee(see: SeePerm): boolean {
  return see === 'verified' || see === 'anyone';
}

/** An act tier that requires the owner to be verified before it can go live. */
function isHigherAct(act: ActPerm): boolean {
  return act === 'verified';
}

/**
 * Editor-lock predicates — the NARROW "owner must be verified" check applied at
 * the card editor / add-card surfaces (CardEditorSheet / PermissionPicker).
 *
 * Distinct from the gate's internal isHigherSee/isHigherAct CLAMP predicates
 * above: only the 'verified' tier — "restrict visibility to verified CALLERS" —
 * requires the owner to be verified. 'anyone' is the network's baseline reach
 * (an unverified user MUST stay discoverable — the reach thesis) and is never
 * locked. The two predicate families intentionally diverge for now; see
 * DEFERRED.md — isHigherSee (clamp) still treats 'anyone' as gated, to be
 * reconciled later.
 */
export function seeTierRequiresOwnerVerification(see: SeePerm): boolean {
  return see === 'verified';
}

export function actTierRequiresOwnerVerification(act: ActPerm): boolean {
  return act === 'verified';
}

/**
 * The safe tier a locked permission is clamped to while verification is
 * unsatisfied. 'contacts' keeps the card usable among known contacts without
 * exposing the gated (verified/anyone/verified-act) tier.
 */
const CLAMP_SEE: SeePerm = 'contacts';
const CLAMP_ACT: ActPerm = 'contacts';

/** A card or draft — the gate only reads the permission + requirement fields. */
type GateInput = Pick<
  Card | CardDraft,
  'see_perm' | 'act_perm' | 'verification_required'
>;

export interface CardGateResult {
  verificationRequired: VerificationRequired;
  /** The entity flag that satisfies this card, or null when none is required. */
  requiredFlag: VerifiedFlag | null;
  /** Entity holds the required flag (or the card requires nothing). */
  satisfied: boolean;
  /** The card asks for a higher see/act tier that the gate protects. */
  requestsHigherPerm: boolean;
  /** The card may go live with its requested permissions. */
  canGoLive: boolean;
  /** Derived status to persist on the card row. */
  verificationStatus: VerificationStatus;
  /** Permissions the card is allowed to expose right now (clamped if locked). */
  clampedPerms: { see_perm: SeePerm; act_perm: ActPerm };
  /** Human-readable lock reason, or null when nothing is locked. */
  lockedReason: string | null;
}

/**
 * Evaluates the gate for a card (or draft) against its owning entity. Pure and
 * deterministic — same inputs, same result.
 *
 * Rule: if the card requires verification (`verification_required !== 'none'`)
 * it cannot go live until the entity's matching flag is true. While unsatisfied,
 * higher see/act tiers are clamped down to a safe tier and the derived status is
 * 'pending'; once satisfied, the requested permissions stand and status is
 * 'verified'.
 */
export function evaluateCardGate(
  entity: EntityVerificationFlags,
  card: GateInput,
): CardGateResult {
  const verificationRequired = card.verification_required;
  const requiredFlag = REQUIRED_FLAG[verificationRequired];
  const satisfied = requiredFlag === null ? true : entity[requiredFlag] === true;
  const requestsHigherPerm =
    isHigherSee(card.see_perm) || isHigherAct(card.act_perm);

  // A card that requires verification can only go live once satisfied. A card
  // requiring nothing goes live regardless of its tier.
  const canGoLive = requiredFlag === null ? true : satisfied;

  const clampedPerms = canGoLive
    ? { see_perm: card.see_perm, act_perm: card.act_perm }
    : {
        see_perm: isHigherSee(card.see_perm) ? CLAMP_SEE : card.see_perm,
        act_perm: isHigherAct(card.act_perm) ? CLAMP_ACT : card.act_perm,
      };

  const lockedReason = canGoLive
    ? null
    : `Card requires '${verificationRequired}' verification ` +
      `(entity.${requiredFlag}) before it can go live` +
      (requestsHigherPerm
        ? ' or expose its higher see/act permissions.'
        : '.');

  return {
    verificationRequired,
    requiredFlag,
    satisfied,
    requestsHigherPerm,
    canGoLive,
    verificationStatus: satisfied ? 'verified' : 'pending',
    clampedPerms,
    lockedReason,
  };
}

/**
 * Convenience predicate for the exact acceptance check: can THIS card go live
 * for THIS entity?
 */
export function cardCanGoLive(
  entity: EntityVerificationFlags,
  card: GateInput,
): boolean {
  return evaluateCardGate(entity, card).canGoLive;
}

/**
 * Enforcement for the write boundary. Throws if a card that requires
 * verification is being taken live before the entity is verified. The future
 * card-write path (Day 11-12) MUST call this before persisting a live card —
 * the prompt/UI must not be the only guard (PROMPT-CODE CONTRACT).
 */
export function assertCardCanGoLive(
  entity: EntityVerificationFlags,
  card: GateInput,
): void {
  const result = evaluateCardGate(entity, card);
  if (!result.canGoLive) {
    throw new Error(
      `[card-gating] ${result.lockedReason ?? 'card cannot go live'}`,
    );
  }
}
