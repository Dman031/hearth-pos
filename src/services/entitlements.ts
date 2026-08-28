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
