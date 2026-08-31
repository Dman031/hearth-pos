// src/services/entitlements.ts
//
// Module access — the N-1 seam.
//
// PlexMed, PlexLaw and PlexATS are PURCHASED ENTITLEMENTS at a flat monthly
// rate, which is why they live in the account sheet beside identity, contacts
// and money rather than on the tab bar (ruling N-1, 2026-08-28). Nothing about
// them is navigation; they are things you own.
//
// THE GATE IS TWO CONDITIONS, AND THEY MUST NOT COLLAPSE INTO ONE:
//   OWNED     — the module is paid for (commerce).
//   LICENSED  — the verification the module requires is live (verification).
// The two failure states are DIFFERENT SCREENS. Paid but unverified sees the
// ceremony; verified but unpaid sees the price. Collapsing them into a single
// "no access" state would tell someone who has paid that they have not.
//
// TODO(PAYWALL): isModuleOwned() returns true unconditionally because PlexMed's
// paywall is a later session and does not exist yet. This is a deliberate,
// ruled seam (N-1) so the screens build against the right SHAPE without waiting
// on commerce — not a placeholder that got forgotten. When the paywall ships,
// this function reads the real entitlement and NOTHING ELSE IN THIS FILE
// CHANGES. Grep: `grep -rn "TODO(PAYWALL)" src`.

import { REQUIRED_FLAG } from './card-gating';
import type { EntityVerificationFlags } from './card-gating';
import type { VerificationRequired } from '../types/card';

/** The modules that can be owned. One per vertical. */
export type ModuleId = 'plexmed' | 'plexlaw' | 'plexats';

// ─── THE CATALOGUE (N-4-AMENDED, 2026-08-30) ────────────────────────────────
//
// THE MODULE ROW IS ALWAYS VISIBLE; THE BOARD IS WHAT HIDES. N-4 forbade
// visible-locked surfaces because a control that cannot act teaches that
// controls are decorative — right about INERT CONTROLS, wrong about an unsold
// module. DERRICK, RECORDED AS GIVEN: "A price is not an inert control, it is
// an offer, and hiding it means the product cannot be discovered or bought."
// Read the old way, a clinician who had not verified saw no evidence PlexMed
// existed at all: a storefront with no door. That is why this catalogue exists
// — the row needs something to render before it is owned.

export interface ModuleCatalogueEntry {
  /** How the module names itself to its owner. */
  label: string;
  /** One line, under the label, on every arm. Says what the module IS. */
  blurb: string;
  /**
   * Monthly price in cents, or NULL when no price has been ruled.
   *
   * IT IS NULL TODAY AND THAT IS DELIBERATE (ruled 2026-08-30). No PlexMed
   * price exists in the roadmap or anywhere else, and the storefront row is the
   * worst possible place for an invented one: a plausible number on an offer is
   * the placeholder class that shipped fake "12 meals together" metrics to a
   * first-time customer (harvest-once BUG-014). The row renders WITHOUT a price
   * line until the paywall session rules the number. Structure right, number
   * later — never a number that looks real and is not.
   */
  priceCents: number | null;
}

export const MODULE_CATALOGUE: Record<ModuleId, ModuleCatalogueEntry> = {
  plexmed: {
    label: 'PlexMed',
    blurb: 'Open times, visits and superbills for your practice.',
    priceCents: null,
  },
  plexlaw: { label: 'PlexLaw', blurb: 'Coming later.', priceCents: null },
  plexats: { label: 'PlexATS', blurb: 'Coming later.', priceCents: null },
};

/** The verification each module requires to be usable once owned. */
const MODULE_VERIFICATION: Record<ModuleId, VerificationRequired> = {
  plexmed: 'license',
  plexlaw: 'license',
  plexats: 'business',
};

/** Why a module is not usable — each arm is a different screen (see above). */
export type ModuleLockReason = 'not_owned' | 'not_verified';

export interface ModuleAccess {
  owned: boolean;
  licensed: boolean;
  unlocked: boolean;
  /** null when unlocked. Never collapse the two arms into one message. */
  lockedBy: ModuleLockReason | null;
}

/**
 * Whether the caller has PURCHASED the module.
 *
 * TODO(PAYWALL): unconditionally true until the paywall session ships (N-1).
 * Async because the real check is a network read, and making it async now means
 * the call sites do not change shape when it becomes one.
 */
export async function isModuleOwned(module: ModuleId): Promise<boolean> {
  void module;
  return true;
}

/**
 * Whether the entity holds the verification the module requires. Reads the SAME
 * flag map the card gate uses (card-gating.REQUIRED_FLAG), so a module and a
 * card can never disagree about what "licensed" means.
 */
export function isModuleLicensed(
  module: ModuleId,
  entity: EntityVerificationFlags,
): boolean {
  const flag = REQUIRED_FLAG[MODULE_VERIFICATION[module]];
  return flag === null ? true : entity[flag] === true;
}

/** Both conditions, resolved together, with the two lock arms kept distinct. */
export async function getModuleAccess(
  module: ModuleId,
  entity: EntityVerificationFlags,
): Promise<ModuleAccess> {
  const owned = await isModuleOwned(module);
  const licensed = isModuleLicensed(module, entity);
  return {
    owned,
    licensed,
    unlocked: owned && licensed,
    // Ownership is asked about first: someone who has not bought it is not told
    // to go and verify something for a module they do not have.
    lockedBy: !owned ? 'not_owned' : !licensed ? 'not_verified' : null,
  };
}

/**
 * Starts a purchase. THE SEAM THE STOREFRONT TAPS INTO.
 *
 * TODO(PAYWALL): commerce does not exist, and because isModuleOwned() returns
 * true unconditionally, THE ARM THAT CALLS THIS CANNOT FIRE TODAY. It is built
 * anyway, by ruling (N-4-AMENDED): the paywall drops into a structure that
 * already fits it rather than arriving as a refactor of the surface. A branch
 * that cannot fire yet is not a placeholder when the ruling says why it is
 * there.
 *
 * It returns a REFUSAL rather than throwing or silently doing nothing, so that
 * if the arm ever does fire before commerce ships, the caller has something
 * honest to render instead of a tap that appears to work.
 * Grep: `grep -rn "TODO(PAYWALL)" src`.
 */
export async function startModulePurchase(
  module: ModuleId,
): Promise<{ ok: false; reason: 'not_available_yet' }> {
  console.warn('[entitlements] purchase attempted before the paywall exists', { module });
  return { ok: false, reason: 'not_available_yet' };
}
