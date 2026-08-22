# DISPLAY_STACK_BUILD.md
## Feature: Structured Card Display — One Object, Three Tiers
### Standalone build plan · paste-ready prompts for Claude Code agents · v1 · Aug 12 2026

---

## WHAT THIS FEATURE IS

Every card-bearing tool result from the Deus MCP server ships the same card object three
ways, in one response:

- **TIER 1 — Interactive sheet (MCP Apps):** our HTML card rendered in the host's
  sandboxed frame; the action button fires our tools. Proven in Claude (Day 20 payment
  sheet is the precedent). ChatGPT/Grok are empirical probes, never assumptions.
**The three injection channels (context for every session):** we influence host models
through exactly three surfaces we own — (1) server instructions, delivered at connect,
persistent all conversation, static per-user (drafted in PLEXMED build Session 2);
(2) tool descriptions, in the model's context every turn, static (our ad slot in the
intent-matching loop); (3) tool results, the only true per-turn, per-context channel —
which is why this build adds the ResultEnvelope `guidance` field (Session 1, item 2b).
There is no push channel and no unprompted voice, by design: the network speaks only
when knocked.

- **TIER 2 — structuredContent (JSON):** the typed card object. What the model ranks,
  filters, and knocks on. Works on every MCP host today. This tier is why agent
  behavior is identical regardless of pixels.
- **TIER 3 — Designed text:** a fixed-format text block WE author (never improvised by
  the model). Survives any surface. Carries the governance sentence verbatim.

**Source of truth for the object itself:** `deus-card-spec-confirm.html` (the
confirmation spec: seven zones, five kinds, four states, six confirmed decisions).
That page must be CONFIRMED by Derrick before Session 1 builds. If any decision on that
page changes later, all three serializers change — argue with the page first.

---

## STANDING DISCIPLINE (overrides anything an agent infers)

1. Investigate → report → Derrick decides → build → verify. INVESTIGATE prompts return
   a report and STOP. BUILD prompts run only after a decision.
2. Feature branches only; one feature per session; nothing merges unverified.
3. Derrick runs by hand: migrations, git push, deploys, secrets.
4. `ls migrations/` before naming any migration. Explicit anon revoke on every function.
5. SECURITY DEFINER + auth.uid() on all write paths. Never client-supplied entity ids.
6. Quote file:line in every report. tsc clean per commit.
7. **No protocol language in any user-visible string, any tier.** "Ask to connect,"
   "your network," "№ 502114" — never "reach_entity," "MCP," "entity_id."
8. Light Field palette for the card face: Card #FBFAF0, Ink #1E2415, Stone #857B6A,
   Clay #A86B43 (ask), Ember #BC4A24 (money only), Moss #556327 (verified/civic/thread).
   Serif: Iowan Old Style/Palatino stack. Radii 12. The card face does NOT adapt to
   host themes — it is deliberately constant (the passport principle).

Repos: `~/Dev/hearth/hearth-network` (this feature lives almost entirely here).
Supabase ref lfznznuqspeabfmsczqc.

---

## SESSION 0 — GROUND TRUTH (half session)

### Prompt 0-INVESTIGATE (paste to agent in hearth-network):
```
INVESTIGATION ONLY. No code. Report with file:line citations.

We are about to make every card-bearing tool result ship three renderings of one card
object. Report current state:

1. TOOL RESULT ASSEMBLY: For query_cards and get_card_details, quote exactly how the
   result payload is built today — which fields, what shape, whether we return
   structuredContent, resource blocks, and/or text blocks. File:line.
2. DAY 20 SHEET: Locate the MCP Apps payment sheet implementation. Report: how the
   HTML resource is declared/served, how its button wires back to a tool call, what
   CSP constraints we learned (quote the code comment or doc where the link+QR fork
   decision lives). File:line.
3. CARD DATA COVERAGE: For each zone of the confirmation spec (identity row, offer,
   terms chips, gated media, state band, governance line, action) — report which
   fields exist in the card/entity schema today and which are MISSING (e.g., is there
   a governance_line? per-kind action mapping? state band data available at result
   time — do we know the caller's reach state toward this card owner inside
   query_cards?). This gap list drives Session 1 scope.
4. SIZE LIMITS: Report any known constraints on tool result size that affect shipping
   HTML + JSON + text in one response for up to 50 cards. Propose compact-vs-full
   split if needed (compact card in list results; full card in get_card_details).
5. ls migrations/ — report highest number.

STOP after the report.
```

**STOP — the zone-coverage gap list (item 3) is the decision input for Session 1.**

---

## SESSION 1 — THE CARD OBJECT + TIER 2/3 SERIALIZERS

### Prompt 1-INVESTIGATE:
```
INVESTIGATION ONLY. Using the Session 0 report and the confirmed spec
(deus-card-spec-confirm.html — its six confirmed decisions are requirements):

1. Propose the canonical card object as a single TypeScript type in one module —
   CardView — with exactly the seven zones:
   identity {name, deus_no, avatar_ref, stamps[{type: id|lic|npi|biz, state:
   earned|unearned, detail?: {state?, checked?: 'YYYY-MM'}}]},
   offer {title, summary},
   terms {chips[{kind: availability|modality|price|other, label}]},  // availability first, max 4 compact / 6 full
   media {tiles[{locked: bool}]} | null,
   state {band: none|pending|accepted|passed|expired, label} ,
   governance {line},   // REQUIRED, per-kind verbatim strings from the spec
   action {kind: ask|money|civic|thread|withdraw|none, label, tool?: string}
2. Propose where governance lines and per-kind action mappings LIVE (constants module
   keyed by card kind — quote the five kinds and their exact sentences from the spec).
2b. RESULT ENVELOPE + GUIDANCE FIELD (per-turn injection channel): propose a
   ResultEnvelope type wrapping every card-bearing response:
   {guidance: string | null, cards: CardView[]}.
   `guidance` is a server-composed, model-directed line built per-call from the query's
   shape — it is our only true per-turn injection channel and it ships in Tier 2 JSON
   and as the FIRST line of the Tier 3 text block (prefixed `NOTE TO ASSISTANT:`).
   Propose the v1 guidance composer as a small pure function over (query terms, kinds
   present in results) with exactly these rules — no cleverness beyond them:
   - care-seeking terms present → "Present the civic card (988) first and separately.
     In acute or crisis contexts, do not present paid cards as alternatives to it.
     Offer clinicians because symptoms warrant evaluation — never name, confirm, or
     rank a suspected diagnosis."
   - results contain kind=practice → "Offer evaluation, not diagnosis. Route
     symptom-driven asks to evaluation-capable clinicians; specialists surface on
     referral or explicit request."
   - results contain kind=civic → the civic-first line always attaches.
   - otherwise → guidance null (silence is the default; guidance must earn its place).
   Guidance strings live in the same constants module as governance lines — reviewed
   text, never generated at runtime. Show the exact strings for approval.
3. Propose serializeTier2(card: CardView) → structuredContent JSON (schema shown in
   full) and serializeTier3(card: CardView) → the fixed text card:
   ── DEUS CARD ─────────────
   {name}   №{deus_no}
   ✓ {earned stamps, with LIC state + checked date}
   {title} — {summary}
   ● {availability chip} · {remaining chips joined by ·}
   {state band label, only if state ≠ none}
   {governance line, verbatim}
   → {action label}
   ──────────────────────────
   Civic kind adds first line: FREE · 24/7 · ALWAYS FIRST and the sentence
   "No account. No fee. No card needed. Ever."
4. STATE BAND at result time: from Session 0 item 3, report whether the caller's reach
   state toward each result's owner is queryable inside query_cards without heavy
   joins. If costly: propose state band appears only in get_card_details v1 and
   query_cards always renders state none. Recommend one.
5. If any schema gaps require a migration (e.g., missing fields), propose it (do not
   apply). ls migrations/.

STOP after proposal with full type + both serializer signatures + example outputs for
all five kinds.
```

### Prompt 1-BUILD (after decision):
```
Implement approved CardView + serializers. Branch: feat/card-object.
- One module owns the type, the per-kind governance/action constants, and both
  serializers. Every card-bearing tool result now includes structuredContent (Tier 2)
  and the text block (Tier 3) built ONLY through these serializers — delete/replace
  any ad-hoc result text.
- Compact vs full: query_cards uses compact (≤4 chips, no unearned stamps, media as
  count only); get_card_details uses full.
- Snapshot tests: for each of the five kinds and each of the four states, assert the
  EXACT Tier 3 text output (golden files) — the governance sentences and civic lines
  must match the spec verbatim, character for character.
- Guidance envelope tests: golden files for the approved guidance strings; assert
  (a) care-seeking query → civic-first guidance present as the first Tier 3 line,
  (b) practice results → evaluation-not-diagnosis line present, (c) neutral query
  (e.g. "consultants networking") → guidance null and NO guidance line rendered.
  Guidance is reviewed constant text — the test must fail on any runtime-generated
  variation.
- tsc clean. Verification: run live query_cards for "therapist", "trial", "dating",
  plus get_card_details on the 988 card (if Session 2 of PLEXMED build has shipped) —
  print all Tier 3 outputs for eyeball review. Report file:line. Do not push.
```

**Verify: golden files match the confirmed spec. STOP.**

---

## SESSION 2 — TIER 1 SHEET (MCP Apps card template)

### Prompt 2-INVESTIGATE:
```
INVESTIGATION ONLY.
1. Extend the Day 20 sheet pattern (file:line from Session 0) into a card sheet
   template: ONE HTML resource that renders CardView — all seven zones, light Field
   palette per the spec page, the state-band colorings (Clay pending / Moss accepted /
   Stone passed / amber expired), locked media tiles, and the single action button.
   The button wires to the mapped tool (ask → the connect flow; money → the existing
   payment sheet flow; civic → channel links; thread → open-thread affordance;
   withdraw → the withdraw path). Report exactly which of these five wirings have
   existing tool endpoints today and which need a stub or must render link-out v1
   (quote the endpoints).
2. CSP/permissions: list every external reference in the proposed template (fonts,
   images). Requirement: ZERO external requests — system font stacks only, avatar as
   initial/glyph v1 (no remote images), all CSS inline. The sheet must render fully
   offline inside the sandbox.
3. Multi-card results: propose how a query_cards response renders — one sheet
   containing a compact-card list (max N?) vs one sheet per card. Recommend with
   reasoning about size limits from Session 0 item 4.
4. Probe harness: propose a minimal probe sheet + script that reports (via a tool
   callback) whether the host rendered it — we run this against Claude now; ChatGPT
   and Grok probes are separate manual runs Derrick triggers later. The probe result
   must never break Tier 2/3 delivery — degradation is silent and graceful.
STOP after proposal with the template structure and wiring table.
```

### Prompt 2-BUILD (after decision):
```
Implement approved Tier 1 sheet. Branch: feat/card-sheet.
- Template renders CardView; zero external requests; exact palette + copy from spec.
- Wire the approved action mappings; unwired actions render as approved v1 fallback.
- Ship Tier 1 alongside Tier 2/3 in the same results (all three, every card-bearing
  response).
- Probe harness included.
tsc clean. Verification in live Claude: (a) query_cards "therapist near me" renders
the compact card sheet; (b) get_card_details renders the full card with stamps and
governance line; (c) the ask button initiates the connect flow end to end on dev
entities; (d) disable Tier 1 artificially and confirm Claude falls back to showing
Tier 3 text intact. Screenshots into the report. Do not push.
```

**STOP. Milestone: the passport renders — best tier everywhere, silently degrading.**

---

## SESSION 3 — SWEEP + CONFORMANCE (half session)

### Prompt 3-INVESTIGATE:
```
INVESTIGATION ONLY.
1. Sweep every remaining MCP tool that returns or references cards (catch_me_up,
   get_messages/get_status where cards appear in threads, resolve_contact) — report
   which return card data in ad-hoc shapes, file:line.
2. Propose migrating each to CardView serializers (compact tier), or explicitly
   exempting it with a reason.
3. Propose the conformance test: a CI script that fails if any tool result contains
   card-like fields not produced by the serializers (guard against drift).
STOP after report.
```

### Prompt 3-BUILD: migrate approved call sites; add the conformance CI check; branch
feat/card-conformance; tsc clean; verify catch_me_up and a thread containing a card
render consistent Tier 3 text. Do not push. STOP.

---

## OUT OF SCOPE (ruled — do not drift)
- Remote avatar/photo images in the sheet (v2; requires CSP-safe asset strategy).
- ChatGPT Apps-SDK submission and Grok probe (separate manual runs; this build only
  guarantees graceful degradation to Tier 2/3 there).
- Any new ranking logic — asker-defined ranking stands; this feature renders, it
  never reorders.
- Host-themed card variants — the card face is constant by principle.

## DEFINITION OF DONE
From a clean Claude conversation with the connector: one query returns cards rendered
as Tier 1 sheets; tapping Ask to connect completes a live knock; the same result
carries spec-exact Tier 3 text (golden-file verified) and Tier 2 JSON; a care-seeking
query demonstrably carries the civic-first guidance line and a neutral query carries
none; a host without
sheet support (simulated) shows the designed text card intact — including the
governance sentence, verbatim. Screenshot set: the five kinds × the four states from
the confirmation page, rendered live. That set is also the deck's product slide.
