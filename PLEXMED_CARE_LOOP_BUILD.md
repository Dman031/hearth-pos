# PLEXMED_CARE_LOOP_BUILD.md
## Feature: PlexMed — Clinician Care Loop (Reach → Visit → Record)
### Standalone build plan · paste-ready prompts for Claude Code agents · v1 · Aug 12 2026

---

## HOW TO USE THIS DOCUMENT

**EXECUTION ORDER — READ FIRST.** This doc's sessions are numbered in dependency
order (S0 → S10), but two sessions are EXPANSIONS living in sibling docs, and the
sprint calendar interleaves docs. The rules:
- **The calendar is PLEXMED_10_DAY_SPRINT.md** — it names which doc + session to
  paste each day. When in doubt, the sprint file wins.
- **Session 3 (credential chain): run it via CREDENTIAL_VERIFICATION_BUILD.md**,
  which expands S3 into five gated sessions (vendor memo, PSV, binding, stamps,
  monitoring). The S3 text below is the summary of record; the standalone doc is
  what you paste from.
- **Session 4 (display stack): run it via DISPLAY_STACK_BUILD.md** — same
  relationship. The S4 text below is superseded by that doc.
- Everything else (S0–S2, S5–S10) is run from THIS doc directly, in order.


Open this in a fresh strategy chat or hand sections directly to Claude Code agents in Cursor.
Every session follows the standing discipline — these rules override anything an agent infers:

1. **Investigate → report → Derrick decides → build → verify.** Every prompt below is split
   into an INVESTIGATE prompt and a BUILD prompt. Never hand an agent the build prompt until
   the investigation report has been reviewed and a decision made.
2. **Feature branches only.** One feature per session. Nothing merges unverified.
3. **Derrick runs by hand:** migrations (Supabase SQL editor), git push, deploys, secrets.
4. **Agents must `ls migrations/`** before naming any migration number. Numbers below are
   written as `00XX` deliberately — the agent must discover the real next number.
5. **Every migration that creates a function must explicitly revoke execute from anon.**
6. **All write paths:** SECURITY DEFINER RPCs deriving sender from `auth.uid()` via
   `current_entity_id()`. Never client-supplied entity ids.
7. **Quote file:line in every report.** No asserting without ground truth.
8. **`tsc` clean per commit. Bundle rebuild before any device verify.**
9. Repos: `~/Dev/hearth/hearth-network` (Worker + MCP + migrations) and
   `~/Dev/hearth/hearth-pos` (Expo/RN app). Supabase ref `lfznznuqspeabfmsczqc` (shared
   dev instance — treat with care, it is not production but it is not disposable).
10. **Never expose MCP/protocol language in any user-facing string.** "Ask to connect,"
    never "reach_entity." "Your network," never "the MCP server."

**Sequencing rule for this whole build:** Sessions 1–3 are prerequisites for everything
else and for two other verticals (trials, urgent/civic lane). Sessions 4–9 are PlexMed
proper. Session 10 is Canvas. Do not reorder past a STOP.

**Design rule for this whole build:** All clinician-facing (PlexMed) screens use the
LIGHT Field palette — Paper #E8E6D2, Card #FBFAF0, Ink #1E2415, Stone #857B6A, accent
Clay #A86B43, verified/success Moss #556327, money moments Ember #BC4A24. The dark
system (bg #050505 / surface #111 / accent #D4A574) remains the consumer app surfaces.
Serif display: Iowan Old Style / Palatino stack. Radii 12/24. No protocol language.

---

## SESSION 0 — GROUND-TRUTH SWEEP (half session, do first)

### Prompt 0-INVESTIGATE (paste to agent in hearth-network):
```
INVESTIGATION ONLY. Do not write code. Produce a report with file:line citations.

Context: We are about to build a clinician vertical (PlexMed) on the existing card /
knock / thread / engagement / payment rails. Before any build, I need current ground truth.

Report on:
1. CARD MODEL: Where is the card schema defined (table + any kind/type enum)? List every
   current card kind value found in migrations and code. Quote file:line.
2. QUERY PIPELINE: In the MCP tool query_cards, trace the full path from request to
   response. Specifically: (a) is the `filters` parameter (including kind) actually
   applied server-side — quote the line or state definitively it is not; (b) is
   sort_key "verified" wired to anything — quote the line or state it is not;
   (c) what text is used as embedding input for cards — find where embedding input is
   assembled (check the backfill-embeddings edge function and any insert-time path) and
   quote exactly which fields are concatenated.
3. VERIFICATION MODEL: Where do the current verified flags (identity/business/credential)
   live? What sets them today? Quote file:line.
4. ENGAGEMENT STATES: List the current engagement state machine values and where
   transitions happen. Quote file:line.
5. INBOUND: How does a knock currently render in the app's Incoming tab — which component,
   what fields does the tile show? Quote file:line in hearth-pos.
6. MIGRATIONS: Run ls migrations/ and report the highest number.

Output: a numbered report, no recommendations, no code. STOP after the report.
```

**STOP — review report. It determines Session 1's exact scope.**

---

## SESSION 1 — RETRIEVAL HYGIENE (kind filtering + verified sort + embedding input)
*Fixes the three demo-breaking findings: trial cards flooding all queries, sort_key
"verified" non-functional, filters.kind unconfirmed. Prereq for every demo in every vertical.*

### Prompt 1-INVESTIGATE:
```
INVESTIGATION ONLY. Using the Session 0 report as ground truth:

1. Propose (do not apply) the minimal change so query_cards honors filters.kind
   server-side. Show the exact SQL/TS diff you would make.
2. Propose the minimal change to make sort_key "verified" actually order
   identity-verified entities' cards first, applied AFTER semantic retrieval, not by
   mutating the embedding query.
3. For embedding input: report whether the eligibility field (and the large trial text
   fields, see gen_seed.py:56 — eligibility clipped to 1200 chars) is included in
   embedding input. If yes, propose the revised embedding-input assembly: title + kind +
   condition/summary + location fields ONLY; eligibility becomes display-only. State
   whether a re-backfill of all embeddings is required and estimate scope.
4. Report the retrieval window size (top-k) and where it is set.

Deliver as a proposal with exact diffs. STOP. Do not implement.
```

### Prompt 1-BUILD (only after decision):
```
Implement the approved Session 1 proposal exactly as decided:
- filters.kind honored server-side in query_cards
- sort_key "verified" = post-retrieval ordering by owner identity verification
- embedding input reduced to [approved field list]; eligibility display-only
Branch: feat/retrieval-hygiene. tsc clean. Write a verification script that runs three
queries against local/dev: "consultants networking", "dating", "breast cancer trial
Portland" and prints kind distribution + verified ordering of results, so we can prove
trials no longer flood unrelated queries and verified ranks first.
If embeddings must be regenerated: STOP after code + migration proposal — Derrick applies
the migration by hand and runs backfill-embeddings until remaining=0, then you verify.
Do not push. Report with file:line of every change.
```

**Verify:** the three-query script shows: dating query returns 0 trial cards when
filters.kind excludes them; verified entities rank first. STOP.

---

## SESSION 2 — CIVIC CARD CLASS (the free, unmonetizable lane) — SHIPS BEFORE ANY PAID CLINICIAN
*The 988 lane. Free by structure, not by policy: the card kind has no payment rails to invoke.*

### Prompt 2-INVESTIGATE:
```
INVESTIGATION ONLY. Propose (do not apply) a migration + code plan for a new card kind
"civic" with these structural properties:
1. Cards of kind civic cannot be referenced by any payment or engagement-creating RPC —
   identify every RPC that creates engagements/payments (quote file:line from Session 0
   report) and propose the guard (refuse with explicit error if card.kind = 'civic').
2. civic cards carry fields: name, description, channels (call/text/chat URLs), hours,
   languages, coverage (e.g. US), and a source attribution field.
3. query_cards behavior: when the query context includes crisis/urgent-support intent
   terms, civic cards are eligible on all queries; they are never excluded by kind filters
   (a filters.kind request cannot filter OUT civic when the query is care-seeking).
   Propose the minimal honest implementation — if intent detection server-side is too
   clever/fragile, the acceptable v1 is: civic cards always pass kind filters.
4. Seed data: propose the seed for exactly one civic card v1: 988 Suicide & Crisis
   Lifeline — call 988, text 988, chat via 988lifeline.org, 24/7, English/Spanish +
   interpreter languages, US coverage. No other civic cards in v1.
5. Tool description update for the MCP server: the connector's instructions must state
   that acute/crisis situations route to the civic card (988) FIRST and that paid cards
   must not be offered in acute contexts. Draft the exact instruction text for review,
   and include these two rules verbatim in the draft:
   (a) SYMPTOM RULE — clinician offers are made because symptoms warrant evaluation,
       NEVER because of a suspected condition: the connector must never name, confirm,
       or rank a possible diagnosis in any offer or result.
   (b) ROUTING RULE — symptom-driven asks surface evaluation-capable clinicians
       (primary/urgent evaluation); specialist cards surface only on referral or the
       user's explicit request.
   Note: these same rules also ship dynamically per-result via the ResultEnvelope
   `guidance` field (see DISPLAY_STACK_BUILD.md Session 1 item 2b) — instruction text
   is the static layer, guidance is the per-turn layer; the strings must stay
   consistent between the two (single constants module).

Remember: migration must explicitly revoke anon execute on any new function. ls
migrations/ for the real number. STOP after proposal.
```

### Prompt 2-BUILD (after decision):
```
Implement approved Session 2 plan. Branch: feat/civic-card-class.
- Migration file written to migrations/ (Derrick applies by hand; STOP and wait after
  writing it)
- Guards in all engagement/payment RPCs against kind='civic'
- 988 seed SQL (Derrick applies; then Derrick runs backfill-embeddings to remaining=0)
- MCP server instruction text updated as approved
Verification script: (1) attempt to create an engagement against the civic card via the
RPC path and prove it refuses; (2) query_cards "I need to talk to someone right now" and
print results proving the 988 card returns. tsc clean. Report file:line. Do not push.
```

**Verify on live worker via Claude/ChatGPT connector: a care-seeking query surfaces 988
first, and no payment path can touch it. STOP.**

---

## SESSION 3 — CREDENTIAL CHAIN (PSV API + identity-record binding) — GATE TO THE VERTICAL
*Fully electronic: identity ✓ (exists) + primary-source verification via API + name/DOB
concordance binding = LIC/NPI stamps with receipts. APPROVED DIRECTION: see
`deus-credential-verification-workflow.html` (the confirmed workflow page; the archived
phone-binding version `deus-credential-verification-v1-phone.html` survives only as the
manual-review fallback for collisions). Nothing clinician-facing ships before this.*

### Prompt 3-INVESTIGATE:
```
INVESTIGATION ONLY. Design the credential verification chain per the CONFIRMED workflow
page (deus-credential-verification-workflow.html). Its five approved rulings are
requirements, not options:

1. METHOD = PSV API. Report the integration options for primary source verification:
   Verifiable-class API vendors (Verifiable, CertifyOS), direct sources where free and
   real-time (NPPES lookup API always; Nursys for nurses; Oregon board's electronic
   lookup — report what Oregon actually exposes programmatically), and OIG exclusion
   checking. Produce a comparison (per-check cost, coverage of Oregon behavioral-health
   + medical boards, continuous-monitoring support, API auth model, BAA/DPA posture).
   VENDOR SELECTION IS A DERRICK DECISION — present the comparison and STOP on it.
2. BINDING = CONCORDANCE, NOT CONTACT. The binding is a legal-name + DOB match between
   the identity-verification attestation (existing identity tier — report exactly which
   fields our identity vendor returns and quote where they're stored) and the
   primary-source record. Specify the match algorithm (exact legal name normalization,
   DOB where the source exposes it, license number as discriminator), the collision
   path (ambiguity → manual_review status, reviewed by Derrick, method recorded), and
   the hard rule: NO OVERRIDE PATH exists in code.
3. SCHEMA: verifications table — entity_id, type [identity|npi|license|exclusions],
   source (nppes|state_board:OR|oig|vendor:X), registry_ref, snapshot jsonb, status
   [verified|manual_review|voided], method [psv_api|concordance|manual_fallback],
   checked_at, monitor (bool), voided_at, void_reason. RPCs SECURITY DEFINER,
   auth.uid()-derived, anon-revoked.
4. RECEIPTS IN THE CARD: stamps expose type + source + checked date (+ expiry where the
   source provides it) — the four-receipt block from the workflow page — in CardView
   (coordinate with DISPLAY_STACK_BUILD's stamp schema; single source of truth, no
   duplicate stamp models). Never raw registry payloads in query results.
5. CONTINUOUS MONITORING: propose the auto-void pipeline — vendor webhook or scheduled
   re-check (report what the selected-vendor tier supports), voiding writes voided_at +
   reason, and stamps disappear network-wide on next query with zero additional code
   (prove this falls out of the read path).
6. COLD-ARRIVAL FLOW: specify the app flow minute-by-minute per the workflow page
   (identity → license number field → PSV → concordance → stamped), including the
   claimable-record convergence: claiming a kind=record card ENDS in this exact
   ceremony and flips record → practice card on success.
7. COST MODEL: per-verification cost at the selected vendor vs. the $10/mo module —
   state the payback math plainly.

ls migrations/. STOP after proposal with the vendor comparison FIRST — that decision
gates the rest.
```

### Prompt 3-BUILD (only after vendor decision + proposal approval):
```
Implement approved credential chain. Branch: feat/credential-chain.
Migration written to migrations/ (STOP for hand-apply). RPCs with anon revoked.
PSV integration server-side, result snapshotted at verification time (never proxied
live per-query). Concordance binding with collision → manual_review. Stamps + receipts
flow into CardView per the display-stack schema. Monitoring pipeline wired (webhook or
scheduled per vendor decision).
Verification (the proof standard, all five must pass):
(1) test clinician entity goes cold → identity → NPI/license entry → PSV → concordance
    → stamped, fully electronically, on dev;
(2) stamps render with receipts in a live query_cards result from Claude;
(3) a name-mismatch case lands in manual_review and CANNOT be force-approved;
(4) voiding the verification row removes stamps network-wide on the next query;
(5) a simulated monitoring event (lapse) auto-voids.
tsc clean. Report file:line. Do not push.
```

**STOP. Milestone: after Session 3, the trials vertical, the Handoff pitch, the Portland
seed (records → claim → this ceremony), and every "verified clinician" sentence unblock.**

---

## SESSION 4 — DISPLAY STACK (three-tier card rendering)
*One tool result ships all three tiers: MCP Apps sheet, structuredContent JSON, designed text.*

### Prompt 4-INVESTIGATE:
```
INVESTIGATION ONLY.
1. Locate the Day 20 MCP Apps payment sheet implementation (quote file:line) — the card
   sheet extends this pattern.
2. Report how tool results are currently assembled for query_cards and get_card_details:
   do we return structuredContent? A text block? Quote the assembly code.
3. Propose the three-tier result format:
   TIER 1: an MCP Apps card sheet template (single HTML resource) rendering: avatar,
   name, deus number, stamps row, title, chips (availability/price/location), locked
   photo tiles when photo cards exist at a gated tier, governance line, ONE action
   button wired to the reach flow. Light Field palette. No protocol language.
   TIER 2: structuredContent JSON schema for a card: {kind, name, deus_id, stamps:{...,
   checked dates}, fields, availability, price_cents, governance_line, actions[]}.
   TIER 3: the canonical text card — fixed format, authored not improvised:
   ── DEUS CARD ─────────────
   {name}   №{deus_id}
   ✓ {stamps with dates}
   {title} — {summary}
   ● {availability} · {terms}
   {governance line}
   → {single action}
   ──────────────────────────
   All three ship in EVERY card-bearing tool result.
4. Flag any size/limit constraints on tool results that affect shipping all three tiers.
STOP after proposal with exact schemas.
```

### Prompt 4-BUILD (after decision):
```
Implement approved three-tier display stack. Branch: feat/display-stack.
Template once, project three ways — the card is defined in one place; tiers are
serializers of the same object. Apply to query_cards results (compact card) and
get_card_details (full card). Empirical probe scripts for host support: a test sheet
that reports whether it rendered (we probe Claude now; ChatGPT/Grok probes are separate
runs Derrick triggers). tsc clean. Verify in live Claude: a query renders the Tier 1
sheet; the same result's text block matches the canonical format exactly. Report
file:line. Do not push.
```

**STOP. Everything after this renders properly everywhere.**

---

## SESSION 5 — CLINICIAN CARD KIND + AVAILABILITY
### Prompt 5-INVESTIGATE:
```
INVESTIGATION ONLY. Propose the clinician practice card: kind "practice" (or extend an
existing kind — argue from the Session 0 card-model report), fields: specialty,
modalities[telehealth|in_person], session_minutes, price_cents, sliding_scale bool,
license_states[], new_clients bool, open_slots[] (v1 manual: array of ISO datetimes the
clinician sets; auto-pause knocks when empty). Stamps come from Session 3. Propose how
open_slots surfaces in query_cards results ("Video today 4:40" chip derives client-side
from slots). Migration plan + app screens (light palette) for card authoring in Profile.
ls migrations/. STOP.
```
### Prompt 5-BUILD: implement as approved; branch feat/clinician-card; same verification
pattern (live query shows a clinician card with availability chip). STOP.

---

## SESSION 6 — CLINICAL INCOMING (ask-first + honesty chips)
### Prompt 6-INVESTIGATE:
```
INVESTIGATION ONLY. Extend the Incoming knock tile (Session 0 report, hearth-pos
component) for practice-card knocks:
1. Chips: IDENTITY ✓ / {STATE} RESIDENT ✓ (from entity data we actually hold — if we
   cannot verify residency v1, the chip must not exist; report what we can honestly claim)
   / NON-ACUTE · SELF-DESCRIBED (always, verbatim — this chip states what the system did
   NOT verify) / FIRST CONTACT.
2. Third action "Ask first": a pre-accept question — propose the minimal thread state
   (e.g. a thread in state "inquiry" that does not open an engagement and does not
   reveal contact tiers) using the existing thread model. Quote the state machine you'd
   extend, file:line.
3. Patient-side: how her assistant sees "he asked a question first" via get_status.
STOP after proposal.
```
### Prompt 6-BUILD: implement as approved; branch feat/clinical-incoming; verify with a
live knock from a test entity showing all three actions and the inquiry state
round-trip. Light palette on clinician surfaces. STOP.

---

## SESSION 7 — TODAY VIEW + VISIT WRAP (PlexMed's two screens)
### Prompt 7-INVESTIGATE:
```
INVESTIGATION ONLY. Using existing engagements as the source of truth:
1. TODAY: a schedule strip + visit tiles screen assembled entirely from accepted
   engagements with slot datetimes (Session 5). Tile: patient first-name, new/follow-up,
   her note, latest assistant-logged summaries from the thread, plan status if a plan
   exists. Quote which queries/RPCs supply each field; propose any missing read RPC.
2. WRAP: on engagement completion, a wrap screen with three items: (a) plan tiles —
   propose plan as structured thread messages (type "plan", items[] with done flags both
   parties can see; patient can check off) NOT a new table unless the report argues
   otherwise; (b) cadence — a per-thread nudge_after_days setting; nudges are ALWAYS
   drafted-then-sent by the clinician's tap, never auto-sent; (c) follow-up booking =
   existing engagement creation with price snapshot.
3. Engagement states: propose adding in_visit and wrapped transitions to the existing
   machine (quote current states from Session 0).
STOP after proposal.
```
### Prompt 7-BUILD: implement as approved; branch feat/plexmed-today-wrap; light palette;
verify the full cycle on dev: accept → today strip → in_visit → wrap (plan shared,
cadence set, follow-up booked, payment settled via existing rails). STOP.

---

## SESSION 8 — PRIVATE NOTES + SUPERBILL/EXPORT
### Prompt 8-INVESTIGATE:
```
INVESTIGATION ONLY.
1. PRIVATE NOTES: per-thread clinician-only notes. Propose storage with RLS such that
   ONLY the authoring entity can ever read (prove the policy SQL), encrypted at rest per
   our Supabase posture, exportable, hard-deletable. UI carries verbatim label:
   "PRIVATE · VISIBLE ONLY TO YOU · NOT THE MEDICAL RECORD". Report RLS policy text.
2. SUPERBILL: PDF generation from thread data (visit date, duration, CPT + ICD codes the
   clinician selects from a short list on wrap, price paid, provider NPI + license
   stamps, patient name). Propose the generation path (edge function vs client) and
   where the PDF lands (thread attachment via existing message model?).
3. VISIT SUMMARY EXPORT: same data as a clean one-page PDF + copy-to-clipboard text.
CPT/ICD in v1 are clinician-entered/selected — we never auto-code. STOP after proposal.
```
### Prompt 8-BUILD: implement as approved; branch feat/notes-superbill; verify: note
invisible to patient entity (prove via RLS test with both tokens), superbill PDF
renders with stamps and lands in thread. STOP.

---

## SESSION 9 — MODULE PACKAGING (PlexMed as an enable-able paid module)
### Prompt 9-INVESTIGATE:
```
INVESTIGATION ONLY. Propose the module gate: entity-level module flags (plexmed: bool),
$29/mo via a Stripe subscription on the clinician's existing Connect-adjacent customer
object (report what exists for subscriptions today — if nothing, propose minimal Stripe
Billing integration), and the gating rule: Today/Wrap/Notes/Superbill screens require
the flag; reach, threads, Incoming, and payments NEVER gate — the network stays free.
Propose the upgrade screen copy (light palette): "Reach is free. PlexMed runs your day.
$29/month." STOP after proposal.
```
### Prompt 9-BUILD: implement as approved; branch feat/plexmed-module; verify flag off →
screens gated with upgrade card, flag on → full module; reach unaffected either way. STOP.

---

## SESSION 10 — CANVAS SANDBOX INTEGRATION (the FHIR handshake)
### Prompt 10-INVESTIGATE:
```
INVESTIGATION ONLY. Derrick has created a free Canvas Medical developer sandbox account
(manual step — do not attempt signup). Using Canvas's public API docs:
1. Report the auth model for their FHIR API (sandbox credentials flow).
2. Propose the v1 push: on wrap, one tap "Send to Canvas" builds a FHIR bundle —
   Patient (match-or-create by name+DOB the clinician confirms), Encounter (telehealth,
   CPT as coding), Condition (ICD selected at wrap), DocumentReference (visit summary
   PDF), Observation bundle optional v2 (BP readings). Map each field from our thread/
   engagement data to the FHIR resource — show the exact mapping table.
3. Failure posture: push is fire-and-report; a failed push NEVER blocks wrap; the export
   PDF path (Session 8) is always the fallback and remains the universal answer for
   non-Canvas EHRs.
4. Testing: propose the MedPlum local rig (Docker) + Synthea synthetic patients as the
   automated conformance test so CI never touches Canvas or real PHI.
STOP after proposal with the mapping table.
```
### Prompt 10-BUILD: implement as approved; branch feat/canvas-push; verify: a wrapped
dev visit pushes a valid bundle to MedPlum local (automated) and to the Canvas sandbox
(manual run by Derrick); Canvas UI shows the encounter. STOP.

---

## OUT OF SCOPE FOR THIS BUILD (ruled, do not let agents drift into these)
- **Inline video**: separate feature. One probe session (getUserMedia in an MCP Apps
  sheet in Claude) may run anytime; the visit v1 is "one tap opens encrypted room"
  via a vendor with BAA — vendor selection is a Derrick decision, not an agent task.
- **AI scribe / recording**: refused for v1. Contradicts the "not recorded" promise.
- **Insurance claims / eligibility**: cash + superbill only. Claims API waits for an
  anchor demand.
- **Treatment-plan ingestion**: doctrine — plans and streams stay home; summaries and
  asks travel. The patient's treatment plan is ASKER-SIDE context (uploaded to their
  assistant, never to Deus): the assistant compiles it into precise queries and
  standing asks; the network receives generic queries and returns verified supply,
  and never holds, parses, or stores the plan. No plan-upload endpoint exists.
- **Outcome claims & condition-triggered commerce**: no card of any kind may make
  health-outcome claims (enforced as a listing rule at card creation — category
  vocabulary for treatment-adjacent business cards: comfort, logistics, appearance,
  nutrition-support). The connector never suggests goods/services BECAUSE a user has
  a condition — only in answer to the user's ask. Patient asks → network answers →
  humans accept, every time.
- **Raw wearable ingestion**: doctrine — summaries arrive as ordinary thread messages
  from the patient's assistant; streams stay client-side. No ingestion endpoints.
- **EHR write-back beyond Canvas sandbox**: waits for an anchor.
- **Auto-sent nudges, auto-coding, auto-diagnosis**: never. Clinician taps, selects,
  decides — every time.

## COMPLIANCE CHECKLIST (Derrick, parallel track — not agent work)
- [ ] BAA posture review: Supabase (PHI-adjacent thread content), any video vendor,
      Canvas (sandbox = synthetic only; BAA before any real patient)
- [ ] Counsel review: crisis-language copy (988 card + connector instructions),
      superbill template, "not the medical record" labeling, per-state telehealth +
      recording-consent rules (Oregon first)
- [ ] App Store: health category questions + UGC moderation story (civic lane and
      verification stamps are the answer — have screenshots ready)

## DEFINITION OF DONE FOR THE WHOLE FEATURE
One real (test-cohort) clinician: NPI-verified with stamps live → receives a knock from
a patient entity via Claude → ask-first → accept → engagement at snapshot → appears in
Today → visit (tap-out room) → wrap in 90 seconds → plan tiles + cadence + follow-up →
$95 settles in thread → superbill PDF in thread → encounter lands in Canvas sandbox →
between-visit summary messages render on the clinician tile. Filmed once, end to end.
That film is the PlexMed demo, the clinician sales asset, and the health-vertical
slide of the seed deck.
