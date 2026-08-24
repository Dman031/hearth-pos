# CREDENTIAL_VERIFICATION_BUILD.md
## Feature: Credential Verification — PSV Into the Cards
### Standalone build plan · paste-ready prompts for Claude Code agents · v1 · Aug 15 2026

---

## WHAT THIS FEATURE IS

Fully electronic proof that a professional is licensed, built into the card:
identity ✓ (existing tier) + primary source verification via API (NPPES, state
board, OIG exclusions) + binding by legal-name/DOB concordance between the
biometric-verified ID and the primary-source record = stamps with receipts,
continuously monitored, auto-voiding on lapse or sanction.

**Source of truth:** `deus-credential-verification-workflow.html` (the five-step
workflow page and its five approved rulings). The archived phone-binding version
(`deus-credential-verification-v1-phone.html`) survives only as the
manual-review fallback for collisions — never the main path.

**Proof standard (the whole feature must pass all five):**
1. A test clinician entity goes cold → identity → license number → PSV →
   concordance → stamped, fully electronically, on dev.
2. Stamps render with receipts in a live query_cards result from Claude.
3. A name-mismatch case lands in manual_review and CANNOT be force-approved.
4. Voiding the verification row removes stamps network-wide on the next query.
5. A simulated monitoring event (license lapse) auto-voids.

**Position in the queue:** runs as PLEXMED Session 3's expansion — after
retrieval hygiene (PLEXMED S1) and the civic lane (PLEXMED S2); coordinates
with DISPLAY_STACK's CardView stamp schema (single stamp model, no duplicates).
Everything clinical — Portland seed, trials Tier-2 demo, Handoff pitch — waits
on this feature's proof standard passing.

---

## STANDING DISCIPLINE (overrides anything an agent infers)

1. Investigate → report → Derrick decides → build → verify. INVESTIGATE prompts
   return a report and STOP.
2. Feature branches only; one feature per session; nothing merges unverified.
3. Derrick runs by hand: migrations, git push, deploys, secrets, VENDOR
   CONTRACTS (agents never sign up for services or handle API keys — they
   design against docs; Derrick provisions credentials).
4. `ls migrations/` before naming any migration. Explicit anon revoke on every
   new function.
5. SECURITY DEFINER + auth.uid() via current_entity_id() on all write paths.
6. Quote file:line in every report. tsc clean per commit.
7. No protocol language user-facing: "Verified license · Oregon board," never
   "PSV," "NPPES," or vendor names in UI strings. Receipts say "the U.S.
   provider registry" and "the Oregon licensing board."
8. Snapshots, never proxies: registry/board results are stored at verification
   time; query paths never call external sources.
9. NO OVERRIDE PATH: ambiguity or mismatch → status manual_review; there is no
   code path that force-approves a failed concordance. This is a structural
   rule — if an agent proposes an admin override, the proposal is rejected.

Repos: `~/Dev/hearth/hearth-network` (nearly everything) and `~/Dev/hearth/
hearth-pos` (the claim/verify flow screens). Supabase ref lfznznuqspeabfmsczqc.

---

## SESSION 0 — GROUND TRUTH (half session)

### Prompt 0-INVESTIGATE (paste to agent in hearth-network):
```
INVESTIGATION ONLY. No code. Report with file:line citations.

We are building electronic credential verification (PSV + concordance binding)
per the confirmed workflow page. Report current ground truth:

1. IDENTITY TIER: How does identity verification work today? Quote where the
   identity-verified flag lives, what sets it, and EXACTLY which fields we hold
   from the identity vendor (legal name? DOB? document type?). If we do not
   currently store legal name + DOB from the identity check, flag it in red —
   concordance binding depends on those fields and Session 3 will need the
   identity flow amended first.
2. STAMP MODEL: Report the current verified flags structure (identity/business/
   credential) in schema and in card payloads. Quote where DISPLAY_STACK's
   CardView stamp schema stands (if that build has run, quote the type; if not,
   note that this build defines the stamp receipts and DISPLAY_STACK consumes
   them).
3. EXTERNAL CALLS: How does the worker currently make outbound API calls
   (fetch patterns, secret storage, retry handling)? Quote an example (e.g.,
   Stripe integration) — the PSV integration will follow the same pattern.
4. ENTITY MODEL: Quote how entities relate to cards and how a flag on an
   entity propagates to all its cards in query results.
5. ls migrations/ — highest number.

STOP after the report. Item 1's red flag (if raised) becomes Session 2's first
task.
```

---

## SESSION 1 — VENDOR COMPARISON (investigation only, hard STOP)

### Prompt 1-INVESTIGATE:
```
INVESTIGATION ONLY. No code, no signups. Produce a decision memo for Derrick.

Compare primary source verification options for Oregon behavioral-health and
medical licenses:

1. VERIFIABLE (verifiable.com) — API-first PSV infrastructure. From public
   docs: API model, what a license verification request/response looks like,
   continuous monitoring support, pricing signals (published or "contact
   sales"), auth model, BAA/DPA availability.
2. CERTIFYOS — API-first alternative. Same dimensions.
3. DIRECT SOURCES, NO VENDOR: NPPES lookup API (free, always used regardless),
   Oregon licensing boards — investigate specifically what the Oregon Board of
   Licensed Professional Counselors & Therapists, the Oregon Medical Board,
   and the Oregon Board of Psychology expose electronically (web lookup with
   scrapable results? actual API? bulk rosters?). Nursys for nurses (real-time,
   board-sourced). OIG exclusions list (free, downloadable + API).
4. HYBRID: free direct sources for NPI + exclusions + whatever Oregon exposes
   cleanly, vendor only for boards without electronic access.

For each option report: per-check cost estimate, Oregon coverage completeness,
continuous-monitoring mechanics (webhook? polling?), integration effort in
sessions, and compliance posture. End with a one-page recommendation table.

DO NOT choose. Present the table and STOP — vendor selection is Derrick's
decision, made outside this chat, and the chosen credentials will be
provisioned by Derrick before Session 2.
```

**HARD STOP — Derrick selects the vendor/path and provisions API credentials.**

---

## SESSION 2 — SCHEMA + PSV INTEGRATION

### Prompt 2-INVESTIGATE:
```
INVESTIGATION ONLY. Using Session 0's report, the selected vendor/path, and the
workflow page's rulings:

1. Propose the verifications table:
   entity_id, type [identity|npi|license|exclusions], source (nppes |
   state_board:OR:<board> | oig | vendor:<name>), registry_ref, snapshot jsonb,
   status [verified|manual_review|voided], method [psv_api|concordance|
   manual_fallback], checked_at, expires_at nullable, monitor bool,
   voided_at nullable, void_reason nullable, reviewed_by nullable.
   RLS: the entity owner reads their own verification rows (receipts view);
   nobody else reads raw snapshots; card payloads carry derived stamps only.
2. Propose the server-side PSV module: verify_npi(npi) and
   verify_license(state, board, license_no) wrapping the selected
   vendor/direct calls, snapshotting responses, normalizing to one internal
   shape. Include the exclusions check in the same ceremony. Retry/timeout
   posture per Session 0 item 3's existing pattern.
3. Propose the RPC surface (SECURITY DEFINER, auth.uid()-derived, anon
   revoked): request_credential_verification(input_number) — callable only by
   an identity-verified entity; orchestrates PSV; writes rows; returns status
   only (never the raw snapshot).
4. If Session 0 flagged missing legal-name/DOB capture in the identity tier:
   propose that amendment FIRST as its own migration + flow change.
ls migrations/. STOP after proposal with full SQL and the module's TS
signatures.
```

### Prompt 2-BUILD (after decision):
```
Implement approved Session 2. Branch: feat/credential-psv.
Migration to migrations/ (STOP for hand-apply). PSV module with the vendor
credentials Derrick provisioned (read from secrets; never hardcoded; never
logged). Dev verification: run verify_npi against a real public NPI and
verify_license against a real Oregon licensee (public data), show snapshots
stored, statuses written. tsc clean. Report file:line. Do not push.
```

---

## SESSION 3 — CONCORDANCE BINDING + COLD-ARRIVAL FLOW

### Prompt 3-INVESTIGATE:
```
INVESTIGATION ONLY.

1. BINDING ALGORITHM: propose the concordance check between the identity
   attestation (legal name + DOB from Session 0 item 1 / Session 2's
   amendment) and the primary-source record:
   - name normalization (case, punctuation, middle name/initial handling,
     suffixes; document the exact rules — no fuzzy scoring in v1, exact
     normalized match or manual_review)
   - DOB match where the source exposes it; license number as discriminator
     when provided
   - outcome: verified | manual_review. NO OVERRIDE (structural rule — do not
     propose an admin approve button; propose a review flow where Derrick can
     mark manual_fallback ONLY by completing the archived phone-binding
     ceremony, method recorded as manual_fallback).
2. COLD-ARRIVAL FLOW (hearth-pos): the minute-by-minute screens per the
   workflow page — identity (existing) → "Verify my license" field → progress
   → stamped or manual_review state. Light Field palette on the
   professional-facing screens. Exact UI copy for every state, including
   manual_review ("We need a human to double-check this — usually within a
   day") — draft for approval.
3. CLAIM CONVERGENCE: specify that claiming a kind=record card routes into
   this exact ceremony and, on verified, flips record → practice preserving
   the deus number. (If the record kind hasn't shipped yet, define the
   interface now so the seed build consumes it.)
STOP after proposal with the normalization rules spelled out.
```

### Prompt 3-BUILD: implement as approved; branch feat/credential-binding;
device-verify the cold flow on dev (bundle rebuilt); prove assertions 1 and 3
of the proof standard (cold-to-stamped electronic; mismatch → manual_review
with no force-approve path — attempt one in the test and show it fail).
tsc clean. Do not push. STOP.

---

## SESSION 4 — STAMPS + RECEIPTS INTO THE CARDS

### Prompt 4-INVESTIGATE:
```
INVESTIGATION ONLY.
1. Propose the derived-stamps computation: entity's verification rows →
   stamps object {type, state?, checked: 'YYYY-MM', expires?: 'YYYY-MM'} —
   coordinate with DISPLAY_STACK CardView (quote its stamp type if built; if
   this build lands first, this proposal DEFINES it and DISPLAY_STACK
   consumes).
2. RECEIPTS VIEW: the four-receipt expandable block (identity attestation /
   primary-source license / concordance log / monitoring status) — where it
   renders (get_card_details full card + the owner's own profile), exact
   user-facing wording per discipline rule 7 (no vendor names, no protocol
   words).
3. Propose the Tier 3 text-card stamp line format with dates (coordinate with
   the golden files).
STOP after proposal.
```

### Prompt 4-BUILD: implement as approved; branch feat/credential-stamps;
prove assertion 2 (stamps + receipts render in a live query_cards /
get_card_details from Claude) and assertion 4 (void the row on dev; stamp gone
on next live query). Golden files updated if DISPLAY_STACK has shipped.
tsc clean. Do not push. STOP.

---

## SESSION 5 — CONTINUOUS MONITORING + AUTO-VOID

### Prompt 5-INVESTIGATE:
```
INVESTIGATION ONLY.
1. Per the selected vendor's actual mechanics (webhook vs. polling — from
   Session 1's memo): propose the monitoring pipeline. If webhook: endpoint
   design (auth, idempotency, replay protection). If polling/none (direct-
   source path): a scheduled re-check (Cloudflare cron trigger) at the
   frequency the source tolerates.
2. AUTO-VOID: monitoring event (lapse, expiry, sanction, exclusion) → row
   voided with reason → prove stamps disappear via the existing read path
   (no new code needed at read time — demonstrate why).
3. OWNER NOTIFICATION: when a stamp voids, the owner gets an Incoming notice
   with the reason and the re-verify path. Draft the copy.
4. Propose the simulated-lapse test fixture for assertion 5.
STOP after proposal.
```

### Prompt 5-BUILD: implement as approved; branch feat/credential-monitoring;
prove assertion 5 (simulated lapse auto-voids; owner notice lands; stamp gone
network-wide). Run the FULL proof standard 1–5 end to end and REPORT it as a
single block — that report, saved as docs/CRED_PROOF_STANDARD.md, is the
verification artifact for anchors and the deck (amended 2026-08-24: was "and
film it"; both films moved post-sprint). tsc clean. Do not push. STOP.

---

## OUT OF SCOPE (ruled)
- Multi-state licensure v1 (Oregon only; the schema carries state so expansion
  is additive).
- Specialty/education/malpractice verification (that's full credentialing —
  Medallion's job, not the stamp's).
- Any override/force-approve path (structural refusal).
- Agents provisioning vendor accounts or touching API keys.
- Non-professional credential claims (the stamp vocabulary is licensed
  professionals + businesses only).

## DEFINITION OF DONE
**AMENDED 2026-08-24 — "and filmed once" became "run and reported once."**

The five-assertion proof standard passes end to end on dev and is RUN AND
REPORTED once: a cold stranger becomes a receipt-stamped, continuously-
monitored, revocable verified clinician in minutes, electronically — and a
forged attempt dies in manual_review. **`docs/CRED_PROOF_STANDARD.md` is the
artifact of record**, carrying the full transcript, the tally, and the standing
gaps. That report unblocks the Portland seed, the trials demo, and every
sentence containing "verified clinician."

Film #1 and Film #3 both moved to a single post-sprint production session
against the finished system (roadmap: SPRINT AMENDMENT — 2026-08-24). Filming
against a half-built stack produces footage that gets reshot anyway. The
footage is no longer what makes this done; the report is.
