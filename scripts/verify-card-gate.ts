/**
 * verify-card-gate.ts — runnable proof of the card permission gate.
 *
 * The repo has no test runner, so this is a standalone assertion script. Run it:
 *
 *   npx tsx scripts/verify-card-gate.ts
 *
 * It exits non-zero (throws) if any assertion fails. The headline case is the
 * acceptance criterion: a card with verification_required='license' CANNOT go
 * live until the entity's credential_verified is true.
 */

import assert from 'node:assert/strict';
import type { EntityVerificationFlags } from '../src/services/card-gating';
import {
  assertCardCanGoLive,
  cardCanGoLive,
  evaluateCardGate,
} from '../src/services/card-gating';
import type { CardDraft } from '../src/types/card';

function flags(
  over: Partial<EntityVerificationFlags> = {},
): EntityVerificationFlags {
  return {
    id_verified: false,
    credential_verified: false,
    business_verified: false,
    ...over,
  };
}

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('card-gating verification:');

// ── Headline acceptance: license card can't go live until credential_verified ─
const licenseCard: CardDraft = {
  title: 'Prescription refill',
  kind: 'capability',
  see_perm: 'anyone',
  act_perm: 'verified',
  verification_required: 'license',
};

check("license card is LOCKED while credential_verified=false", () => {
  const r = evaluateCardGate(flags(), licenseCard);
  assert.equal(r.canGoLive, false);
  assert.equal(r.satisfied, false);
  assert.equal(r.verificationStatus, 'pending');
  assert.equal(r.requiredFlag, 'credential_verified');
  // higher perms are clamped down to the safe tier while locked
  assert.equal(r.clampedPerms.see_perm, 'contacts');
  assert.equal(r.clampedPerms.act_perm, 'contacts');
  assert.ok(r.lockedReason && r.lockedReason.includes('license'));
});

check('assertCardCanGoLive THROWS for the locked license card', () => {
  assert.throws(() => assertCardCanGoLive(flags(), licenseCard), /license/);
});

check('license card GOES LIVE once credential_verified=true', () => {
  const r = evaluateCardGate(flags({ credential_verified: true }), licenseCard);
  assert.equal(r.canGoLive, true);
  assert.equal(r.satisfied, true);
  assert.equal(r.verificationStatus, 'verified');
  // requested perms stand once satisfied
  assert.equal(r.clampedPerms.see_perm, 'anyone');
  assert.equal(r.clampedPerms.act_perm, 'verified');
  assert.doesNotThrow(() =>
    assertCardCanGoLive(flags({ credential_verified: true }), licenseCard),
  );
});

// ── Cross-checks: the other requirement→flag mappings behave the same ─────────
check("business card needs business_verified", () => {
  const card: CardDraft = {
    title: 'Invoice',
    kind: 'capability',
    see_perm: 'verified',
    act_perm: 'verified',
    verification_required: 'business',
  };
  assert.equal(cardCanGoLive(flags(), card), false);
  assert.equal(cardCanGoLive(flags({ business_verified: true }), card), true);
  // the wrong flag does NOT satisfy a business card
  assert.equal(cardCanGoLive(flags({ credential_verified: true }), card), false);
});

check("id card needs id_verified", () => {
  const card: CardDraft = {
    title: 'Verified profile',
    kind: 'presence',
    see_perm: 'anyone',
    act_perm: 'off',
    verification_required: 'id',
  };
  assert.equal(cardCanGoLive(flags(), card), false);
  assert.equal(cardCanGoLive(flags({ id_verified: true }), card), true);
});

// ── 'none' cards are never gated, at any tier ────────────────────────────────
check("verification_required='none' goes live with NO flags, even at 'anyone'", () => {
  const card: CardDraft = {
    title: 'Open hours',
    kind: 'state',
    see_perm: 'anyone',
    act_perm: 'verified',
    verification_required: 'none',
  };
  const r = evaluateCardGate(flags(), card);
  assert.equal(r.canGoLive, true);
  assert.equal(r.requiredFlag, null);
  assert.equal(r.clampedPerms.see_perm, 'anyone');
  assert.equal(r.clampedPerms.act_perm, 'verified');
});

console.log(`\nAll ${passed} checks passed.`);
