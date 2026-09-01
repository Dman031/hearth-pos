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
// controls are decorative. Read the old way, a clinician who had not verified
// saw no evidence PlexMed existed at all: a storefront with no door. That is why
// this catalogue exists — the row needs something to render before it is owned.
//
// WITHDRAWN, AND WRITTEN OUT SO IT IS NOT RE-DERIVED FROM THIS FILE (ruling P-5,
// 2026-08-31). N-4-AMENDED supported the finding above with a second sentence,
// recorded here as given at the time: "A price is not an inert control, it is an
// offer, and hiding it means the product cannot be discovered or bought." DERRICK
// WITHDREW IT: "N-4-AMENDED was about the module ROW EXISTING so a clinician can
// discover PlexMed at all; the problem it fixed was invisibility, not a missing
// number. My phrase 'a price is an offer' overreached."
// THE DOOR IS THE ROW. THE FIGURE IS NOT PART OF THE DOOR. The visibility finding
// stands untouched; nothing about a price follows from it.
//
// N-4 WAS ALSO RIGHT ABOUT INERT CONTROLS, and P-6 restores that half: arm 1 is
// not pressable, because its tap could only ever produce a refusal.

export interface ModuleCatalogueEntry {
  /** How the module names itself to its owner. */
  label: string;
  /** One line, under the label, on every arm. Says what the module IS. */
  blurb: string;
  /**
   * Monthly price in cents. NULL FOR PLEXMED, PERMANENTLY — NOT PENDING.
   *
   * RULED NULL (P-5, 2026-08-31), which is a different fact from the one this
   * comment used to carry. PlexMed's price IS ruled — $15/month flat (P-1) — and
   * it lives on the web, where the transaction is. THE APP NAMES NO FIGURE, SELLS
   * NOTHING AND LINKS NOWHERE (P-3): a clinician subscribes from the web, and the
   * app only ever reads the entitlement that purchase creates.
   *
   * WHY THAT IS THE STRONGER POSITION — DERRICK, RECORDED AS GIVEN: "That removes
   * the Apple question rather than reasoning about where its line falls." A rule
   * that depends on correctly locating someone else's boundary breaks when they
   * move it. This one has no boundary to be on the wrong side of.
   *
   * DO NOT SET IT, AND DO NOT ADD A RENDER BRANCH FOR IT. SettingsPanel had a
   * `priceCents !== null ? … : null` price line; it was REMOVED under P-5,
   * because a branch waiting for a value that can never arrive is a claim about
   * the future written into code. The field stays on the interface for the other
   * modules, whose pricing is unruled.
   *
   * (The original reasoning still holds for any module that IS unpriced: never a
   * plausible invented number on an offer — the class that shipped fake "12 meals
   * together" metrics to a first-time customer, harvest-once BUG-014.)
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
 * if it is ever called, the caller has something honest to render instead of a
 * tap that appears to work.
 * Grep: `grep -rn "TODO(PAYWALL)" src`.
 *
 * DELIBERATELY UNREFERENCED SINCE P-6 (2026-08-31). DO NOT DELETE, AND DO NOT
 * WIRE A BUTTON BACK TO GIVE IT A CALLER. Arm 1 lost its tap because a control
 * whose only possible outcome is a refusal cannot act; this function is now a
 * PERMANENT GUARD, not a stopgap. It is not waiting for commerce to ship — the
 * app does not sell PlexMed and never will (P-3), so a caller appearing here
 * would mean something had started to.
 *
 * THE REASON LITERAL LOST ITS "YET" (P-6). It read 'not_available_yet', which
 * promised an in-app purchase that P-3 forbids and nobody intended to build — AN
 * INVENTED TENSE, true while the paywall was merely unbuilt and false the moment
 * it was ruled to live elsewhere. 'not_sold_in_app' is the permanent fact.
 */
export async function startModulePurchase(
  module: ModuleId,
): Promise<{ ok: false; reason: 'not_sold_in_app' }> {
  console.warn('[entitlements] purchase attempted in-app; PlexMed is sold on the web', { module });
  return { ok: false, reason: 'not_sold_in_app' };
}
