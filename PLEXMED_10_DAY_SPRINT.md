# PLEXMED_10_DAY_SPRINT.md
## PlexMed in Ten Days — One Lane, One 8am Window
### v1 · Day 1 = tomorrow morning · Sessions reference the six build docs (prompts live there)

---

## THE SHAPE OF EVERY DAY (the ritual that makes ten days possible)

- **8:00am — DERRICK'S WINDOW (30–45 min, the only gate of the day):** read
  overnight/yesterday's reports, make every pending ruling, paste the day's
  BUILD prompt(s). No ruling waits past 8am; a skipped window costs the
  sprint a full day.
- **Daytime — THE LANE BUILDS:** one Claude Code session, one feature branch,
  per the doc's BUILD prompt. Derrick hand-applies any migration the moment
  the agent STOPs for it (mid-day interrupt allowed for migrations only).
- **End of day — INVESTIGATE RUNS:** paste tomorrow's INVESTIGATE prompt so
  the report is waiting at the next 8am. Investigations are cheap; they run
  while you sleep.
- **Evening — DERRICK'S HUMAN TRACK (15 min):** the non-code items listed per
  day below (signups, emails, film reviews).

**Standing rulings for this sprint (from Derrick's answers):**
- ONE LANE. No parallel sessions. Scope is cut to fit (see CUT LIST).
- VERIFICATION = DIRECT-SOURCE, FULLY DIGITAL, IN-APP: NPPES API (free) +
  Oregon board electronic lookup + OIG exclusions, zero friction for the
  clinician — one number typed, everything else automatic. A paid PSV vendor
  contract, whenever signed, UPGRADES coverage/monitoring behind the same
  interface — nothing rebuilds, nothing waits on sales calls.
- USER-FACING DESIGNATION: a credential-verified provider is a
  **"Verified Clinician"** everywhere in UI and card text (governance lines,
  stamps header, Incoming chips). "Dr." renders only when the primary source
  credential is a doctoral degree (MD/DO/PhD/PsyD) — the network never
  awards titles the registry doesn't show. Update the constants module
  accordingly in DISPLAY_STACK S1 and CREDENTIAL S4.
- FILM #3 CAST = TEST ENTITIES. (Definition: Film #3 is the end-to-end
  screen recording of one complete visit loop — patient's ask in Claude →
  knock → accept → Today → visit → 90-second wrap → payment settles →
  superbill → encounter lands in the Canvas sandbox. "Cast" = who plays the
  two humans: in this sprint, test entities we control — Biggie-token as
  patient, a test Verified Clinician as provider. A real clinician re-shoots
  it in week 3.)
- VIDEO CALL = **Daily.co prebuilt rooms** for the sprint: embeddable/linkable
  encrypted rooms, free tier sufficient for the film, HIPAA BAA available on
  a paid plan BEFORE any real patient (that upgrade is a Derrick account
  action, not a rebuild). The visit card's button opens the Daily room in
  one tap (the tap-out pattern; in-chat camera stays a post-sprint probe).
  LiveKit remains the self-hosted alternative if Daily displeases — same
  tap-out interface either way.

## DAY 0 — TONIGHT (15 minutes, no agents)
1. **Sign the three pages** (this IS "the signatures": reply in the strategy
   chat with "approved" or list changes for each): card-spec six decisions ·
   credential-workflow five rulings · records R1–R5. The docs cite these as
   source of truth; sessions refuse to run unsigned.
2. Create the **Canvas developer sandbox** account (free, ~10 min).
3. Create a **Daily.co** account (free tier).
4. Send the two PSV vendor inquiries (Verifiable, CertifyOS) — starts the
   contract clock for the post-sprint upgrade; nothing in the sprint waits
   on a reply.

---

## THE TEN DAYS

### DAY 1 — GROUND TRUTH + HYGIENE STARTS
- 8am: paste **PLEXMED S0-INVESTIGATE** (ground-truth sweep). Review lands
  same morning (half-session); rule on it by noon (one mid-day exception).
- Afternoon: paste **PLEXMED S1-INVESTIGATE** (retrieval hygiene proposal);
  review + approve end of day; **S1-BUILD** runs into evening.
- Evening (human): confirm Canvas + Daily accounts live.

### DAY 2 — HYGIENE VERIFIED + CIVIC LANE
- 8am: verify S1 (three-query script: trials stop flooding; verified ranks
  first). Apply any migration/backfill. Paste **PLEXMED S2-INVESTIGATE**
  (civic card + 988 + instruction text w/ symptom & routing rules).
- Day: **S2-BUILD.** Migration + seed hand-applied; backfill to zero.
- EOD: paste **DISPLAY_STACK S0-INVESTIGATE**.

### DAY 3 — THE CARD OBJECT (Tier 2/3 + guidance)
- 8am: rule on DS-S0; paste **DISPLAY_STACK S1-INVESTIGATE** → review →
  **S1-BUILD** (CardView, serializers, ResultEnvelope guidance, golden files
  — with "Verified Clinician" wording in the constants).
- SPRINT CUT: Tier 1 interactive sheet (DS-S2) is DEFERRED — Tier 2/3 render
  everywhere and are enough for all three films. Sheet lands post-sprint.
- EOD: paste **CREDENTIAL S0-INVESTIGATE**.

### DAY 4 — CREDENTIAL GROUND TRUTH + DIRECT-SOURCE DESIGN
- 8am: rule on C-S0 (esp. the legal-name/DOB red flag — if identity capture
  needs amending, that's today's first build). Paste **CREDENTIAL
  S1-INVESTIGATE** amended to DIRECT-SOURCE ONLY: NPPES + Oregon boards'
  electronic lookups + OIG — report exactly what each exposes and the
  friction-free flow; vendor column is future-upgrade notes only.
- Day: review memo (this replaces the vendor HARD STOP — ruling is already
  made: direct-source); paste **CREDENTIAL S2-INVESTIGATE** → approve →
  **S2-BUILD** (schema + direct-source PSV module + snapshots).

### DAY 5 — BINDING + COLD FLOW
- 8am: verify S2 against a real public NPI + real Oregon licensee. Paste
  **CREDENTIAL S3-INVESTIGATE** (concordance rules, cold-arrival screens,
  claim convergence) → approve → **S3-BUILD.**
- Device verify evening: cold → identity → number → stamped, in-app, zero
  friction; mismatch dies in manual_review (attempt the force-approve; show
  it fail).

### DAY 6 — STAMPS + RECEIPTS + MONITORING-LITE → FILM #1
- 8am: paste **CREDENTIAL S4-INVESTIGATE** → approve → **S4-BUILD** (stamps
  into CardView + receipts view, "Verified Clinician" header).
- Afternoon: **CREDENTIAL S5** scoped to monitoring-LITE for the sprint:
  scheduled cron re-check + auto-void + owner notice (vendor webhooks are
  the post-contract upgrade). Run the five-assertion proof standard.
- Evening: **FILM #1** — cold stranger → Verified Clinician in minutes;
  forged attempt dies on camera; simulated lapse auto-voids.

### DAY 7 — CLINICIAN CARD + AVAILABILITY
- 8am: paste **PLEXMED S5-INVESTIGATE** → approve → **S5-BUILD** (practice
  card kind, open_slots manual v1, "Video today · 4:40" chip, authoring
  screens — light palette).

### DAY 8 — CLINICAL INCOMING + ASK-FIRST
- 8am: paste **PLEXMED S6-INVESTIGATE** → approve → **S6-BUILD** (honesty
  chips incl. NON-ACUTE · SELF-DESCRIBED, Ask-first inquiry state, patient-
  side status). Device verify with a live knock from Claude.

### DAY 9 — TODAY + WRAP + SUPERBILL
- 8am: paste **PLEXMED S7-INVESTIGATE** → approve → **S7-BUILD** (Today
  strip, in_visit/wrapped states, wrap screen: plan tiles + cadence +
  follow-up booking).
- Afternoon: **PLEXMED S8** scoped to SUPERBILL + visit-summary export only
  (private-notes pane → post-sprint). 
- EOD: paste **PLEXMED S10-INVESTIGATE** (Canvas push mapping table).

### DAY 10 — CANVAS PUSH → FILM #3
- 8am: approve the FHIR mapping → **S10-BUILD** (wrap → one-tap push to the
  Canvas sandbox; MedPlum rig optional post-sprint; failed push never blocks
  wrap — PDF export is the fallback).
- Afternoon: dress rehearsal, then **FILM #3, one take:** Biggie's ask in
  Claude → guidance renders 988-first → Verified Clinician card → knock →
  Ask-first → Accept → engagement $95 snapshot → Today → Daily room visit →
  90-second wrap → PAID ✓ in thread → superbill PDF → encounter visible in
  Canvas.
- Evening: pour something. Send Film #1 + #3 to the first three warm
  conversations.

---

## THE CUT LIST (deliberately out of the ten days — nothing here blocks the films)
Tier 1 interactive sheet · records seed + funnel experiment (next sprint —
needs hygiene ✓ and ceremony ✓, both now done) · private notes pane · module
paywall wiring ($10 billing) · calendar sync · vendor PSV + webhook
monitoring (lands with the contract) · in-chat camera probe · groups
(approved, parked) · real-clinician reshoot of Film #3 (week 3).

## RISK LEDGER (the three things that actually threaten the schedule)
1. **Oregon board electronic access** — if the board lookup resists clean
   automation, Day 4's memo says so and the sprint ships NPI ✓ + OIG ✓
   stamps with license verification via the vendor upgrade; the flow and
   schema don't change. (NPPES + OIG alone still yield "Verified Clinician
   · NPI-verified" — honest, and enough for the films.)
2. **The 8am window slipping** — every skipped window = +1 day. The ritual
   is the schedule.
3. **Scope adds** — the sprint survives zero new ideas. New ideas go to a
   PARKED.md and live to fight next sprint.
