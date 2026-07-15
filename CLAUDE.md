@AGENTS.md

# HEARTH POS — Agent Instructions

## What this is
The vendor-facing mobile app. Vendors download from App Store, fill conversational profile, become AI-addressable through the Hearth Network. Vendor never sees MCP terminology.

## Architecture
- Expo / React Native, iOS + Android
- Supabase backend (auth, database, storage)
- Stripe Connect Express for vendor payments
- Anthropic API (Opus, model: claude-opus-4-8) for onboarding and classification
- Hearth Network (mcp.hearth.network) is a separate service this app does NOT call directly. POS writes vendor data to Supabase. The Network reads from Supabase.

## Template system
- Templates loaded at runtime from pos_templates table in Supabase
- TemplateRenderer reads config, renders only relevant fields and features
- New templates: JSON insert into Supabase, no app update needed
- Launch templates: generic_service, plumber, coffee_shop, task_runner

## Design system — Teleoplexy "Field" (reskinned 2026-07-14)
**Canonical token source: `docs/brand/field-tokens.css`** (see `docs/brand/README.md` for the brand decisions); `src/styles/theme.ts` is its React Native translation and must stay in sync. Light-first, light-ONLY (dark is a deferred token flip — no switcher).

Paper #E8E6D2 (app background), Surface #FBFAF0 (raised cards, opaque + hairline + e1 shadow — NOT translucent glass), Surface-inset #DED8C0, Ink #1E2415, Ink-2 #414A30, Soft #73785C, Accent #556327 (moss — actions/links), Accent-2 #BE9F49 (wheat — highlight/verified; use accent2Deep #A8791F for wheat TEXT, raw wheat fails contrast on paper), On-accent #F2F0E2, Success #5C6B36, Danger #A23B22, Warning #A8791F, Hairline rgba(33,38,24,0.16)
Border radius: 12px cards, 24px inputs
Type: Hanken Grotesk everywhere (loaded via expo-font, families in `theme.fonts` — set families, never `fontWeight`, or Android fake-bolds). The bespoke Teleo face lives ONLY inside the logo SVGs (`src/constants/brand.ts`), never as a UI font.
Logo: the TELE⟡PLEXY lockup + crest, inlined SVGs in `src/constants/brand.ts`; app icons derive from the crest signet.
HearthOrb: 4-layer radial gradient, 4s breathing cycle, canonical RGBA values: outer rgba(125,140,113,0.22), mid rgba(150,160,120,0.35), inner rgba(200,175,120,0.65), core rgba(255,250,235,0.90). OPEN DECISION: keep orb vs replace with crest (Derrick to confirm) — do not touch the recipe meanwhile.

`docs/deus-prototype.html` is SUPERSEDED for colors/type/brand (it shows the retired dark Deus world). It remains the reference for layout, interaction, and the card model (four tabs, SEE/ACT permission pills, trust-tier identity) until a Field-world prototype replaces it.

## Critical rules
- NEVER expose MCP/protocol terminology to the vendor
- NEVER show features the template has disabled
- ALWAYS use Stripe Connect Express
- ALWAYS track completed_transaction_count for paywall trigger
- ALWAYS use Opus (claude-opus-4-8), never Haiku
- One app, one codebase, infinite business types via templates
- The user-facing app name comes from a SINGLE `APP_NAME` constant (`src/constants/app.ts`) — NEVER hardcode the brand string per screen; derived labels ("{APP_NAME} ID") too. Renamed Deus → **Teleoplexy** 2026-07-14. USER-FACING STRINGS ONLY: infrastructure is not brand — hearth-* repo names and worker URLs (hearth-network.hearthnet.workers.dev is LIVE), package/bundle ids, the `hearth-pos` slug, Supabase refs, edge function names, the `deus_id` column + `deus-id.ts` service, and code identifiers like `HearthOrb` all keep their names. A future rename must also regenerate the lockup SVG (wordmark is baked into vector paths — see `src/constants/brand.ts`).

## Revenue logic
- Free until vendor completes 10 transactions
- At transaction 10: Stripe subscription ($50/mo) auto-activates
- 1.5% fee on all transactions (free tier and paid tier)
- Vendor earns $5/mo referral kickback per household conversion, 12 months max

## MANDATORY: INVESTIGATE BEFORE IMPLEMENTING

Every task follows this three-step protocol. No exceptions.

Operational detail: see `.claude/skills/investigation-first/SKILL.md` for grep commands, risk matrix, and file-touch rules.

### STEP 1: INVESTIGATE
Before modifying ANY file, Claude MUST:
- Search the codebase for all relevant code paths
- Read every file that might be affected
- Check git log for recent changes to those files
- Verify the current state matches what the prompt assumes
- Check for prior implementations (grep for function names, variable names)

### STEP 2: REPORT
Before writing ANY code, Claude MUST produce a findings report:

```
## INVESTIGATION REPORT

### Problem
[One sentence describing the issue]

### Current State
[What the code does right now, with file paths and line numbers]

### Files I Will Touch
| File | Change Type | Risk |
|------|-------------|------|
| [path] | [modify/create/delete] | [low/medium/high] |

### Files I Will NOT Touch
[Explicit list of files in the same area that remain unchanged]

### What This Fix Does
[Specific description of the change]

### What This Fix Does NOT Do
[Explicit boundaries — what's out of scope]

### Potential Side Effects
[Anything that could break]

### Ready to implement?
```

Claude MUST wait for explicit approval ("yes", "go", "do it") before proceeding to Step 3.

### STEP 3: IMPLEMENT
Only after approval:
- Make the narrowest possible change
- One logical change per commit
- Commit locally with descriptive message
- Do NOT push — Derrick pushes manually
- Report what was changed with file paths and line numbers

### RULES
- NEVER say "already implemented" without showing proof (grep output, file contents, git log)
- NEVER modify files outside the approved list from Step 2
- NEVER combine unrelated fixes in one prompt execution
- If investigation reveals the problem is different than described, STOP and report — do not pivot to a different fix
- If a file has been modified in the last 24 hours (git log), flag it as higher risk
- Always run TypeScript compilation check before committing

### COMMIT PROTOCOL
- git add -A && git commit -m "[type]: [description]"
- Types: fix, feat, chore, refactor
- Do NOT git push
- Do NOT amend commits that have been pushed
- Do NOT force push without explicit instruction

### INVESTIGATION SHORTCUTS
When Derrick says "investigate [X]" — run Step 1 and Step 2 only, no implementation.
When Derrick says "fix [X]" — run all three steps, pause at Step 2 for approval.
When Derrick says "just do it" — skip Step 2 approval wait (use for trivial changes only).

## Bug Protocol — Non-Negotiable

This block is always-on for every Claude session in this repo. The canonical archive lives at `BUGS_AND_SOLUTIONS.md` in the hearth-pos repo root. The archive starts empty and gets populated as bugs occur — an empty archive is not a reason to skip the grep step, it just means the grep returns nothing and you proceed.

### Before Proposing ANY Bug Fix

1. **Grep the archive first.** Search `BUGS_AND_SOLUTIONS.md` at repo root for the symptom, the error message, or the affected file/feature.
   ```bash
   grep -i -A10 "<symptom-or-error>" BUGS_AND_SOLUTIONS.md
   ```
2. **If a match exists**, reference the bug ID and state explicitly whether this is (a) a recurrence, (b) a new variant, or (c) a side effect of the prior fix.
3. **If this symptom has been fixed 3+ times**, STOP and escalate. The pattern gets promoted to a hardcoded rule in this file — not patched again.
4. **No "from memory" fixes.** Even if you're certain you've seen this before, grep first. Memory is lossy; the archive is not.

### After Resolving ANY Bug

1. Append an entry to `BUGS_AND_SOLUTIONS.md` with: bug ID, symptom, root cause, fix, files touched, and an `Introduced-by` field.
2. The `Introduced-by` field is **mandatory**. This is the feedback loop that tells us when Claude-generated prompts or fixes are the source of regressions.
3. **The ledger entry and the fix commit ship together.** Never "I'll document it later." If it's not in the archive, it didn't happen.
4. If the bug was introduced by a Claude-generated prompt or fix, flag it for prompt review at end of week.

### Forbidden Shortcuts

- Classifying a bug as `test-construction` just because tests pass. Assert on DB state as ground truth, not `toolUsed` alone.
- Closing a bug without checking whether adjacent payment paths, tool-calling paths, or messaging channels have the same issue.
- Skipping the archive check on "obvious" bugs. Those are exactly the ones we've fixed five times.
- Committing a fix that touches files outside the bug's stated scope without explicit approval. Subagents especially: scope creep is a separate bug, not a bonus.

### When Promoting a Rule to CLAUDE.md

Every newly-promoted rule MUST ship with:
1. A grep command (or equivalent search) in the rule's prevention notes that finds every existing site in the codebase where the rule applies.
2. A one-time codebase sweep in the same commit window, bringing all pre-existing violations into compliance.
3. A note appended to each origin bug entry: `Promoted to CLAUDE.md rule on YYYY-MM-DD`.

Per harvest-once-app BUG-022's workflow failure analysis: post-promotion codebase sweep is not optional. The rule's origin file is the most likely place for the pattern to still be present — sweep it explicitly.

### Promoted Rules (Hardcoded from Recurring Bugs)

*This section grows as patterns recur. When you see a bug fixed 3+ times in the archive, promote it here with a one-line rule.*

- Use `.maybeSingle()` not `.single()` for Supabase queries that may return empty. 406 errors are a symptom of this.
- Admin / role RLS: define a `SECURITY DEFINER` SQL function (e.g., `is_vendor(uuid)`, `is_admin(uuid)`) and reference that function from RLS policies. Never `SELECT` from the same table the policy is guarding. Infinite recursion symptom: "infinite recursion detected in policy for relation..."
- When middleware forces a `tool_choice` AND the tool has required parameters, the system prompt MUST restrict the parameter source to (a) the vendor's current message or (b) an explicit prior-turn assistant suggestion. If neither applies, the tool's contract is to surface a clarification question, not invent a value from older history.
- Never use empty error handlers (`() => {}`, `catch {}`). Every error branch must log at minimum the error value, ideally with context (operation name + relevant IDs). Silent failures are the most expensive bug class — invisible until they cause data corruption or a user-visible regression.
- Validate every required environment variable / runtime binding on startup. Maintain a single `requireEnv()` helper that throws a descriptive error if any required key is missing. Apply at app-init time, not lazily at first use. For Expo, this includes public env vars baked into the bundle — missing keys become `undefined` at runtime with no warning.
- State-transition writes (status, payment confirmation, lifecycle markers, paywall activation) go through one canonical function. UIs and tools call into that path; they never write the row directly. If two write paths exist (e.g., vendor-session vs service-role webhook), extract the row-mutation logic to a shared module — both call sites import from the same module.
- Investigation prompts NEVER modify files. Verify with `git diff` before running.

**SUPABASE WRITE RULE — MANDATORY**

Every `await supabase.from().update()`, `.insert()`, or `.delete()` call MUST destructure `{ error }` or `{ data, error }`. Updates that need confirmation of effect MUST chain `.select()` to verify rows affected. Zero rows affected on a primary-key match is an RLS silent-block signature and MUST be treated as failure, not success. Never use fire-and-forget writes. Applies equally to anon-key vendor sessions (where RLS is the most common silent-block cause) and service-role-key writes (where triggers/constraints still produce silent no-ops).

**PROMPT-CODE CONTRACT — MANDATORY**

Every business rule stated in the system prompt MUST also be enforced in code at the tool boundary. Prompts are suggestions to the model; code is the guarantee to the vendor. If the prompt says "never X", the tool that could do X must reject X server-side. Applies to: required-field checkpoints, value enums, template-gated feature visibility, paywall trigger thresholds, allergen/dietary confirmations, and any "must call tool Y when Z" rule. LLMs ignore prompt instructions probabilistically; code does not.

**AI TOOL-CALLING DISCIPLINE — MANDATORY**

For actions with side-effects (profile writes, payment, template selection, transaction recording), force `tool_choice: { type: 'tool', name: '<tool>' }` from middleware-detected intent rather than relying on voluntary tool selection. Pair with explicit trigger phrases in the system prompt using emphatic language (MUST / NEVER / ALWAYS / CRITICAL). After each model response, validate that any side-effect-claiming text corresponds to an actually-called tool; block the response if it claims an action no tool performed.

**DATE/TIME DISPLAY RULE — MANDATORY**

All vendor-facing and admin-facing date formatting MUST go through `src/datetime.ts`. Never use raw `toLocaleDateString()`, `toLocaleString()`, date-fns `format()` without TZ, or inline timezone math at display sites.

The helper MUST expose at minimum: `formatForDisplay(date, style, tz?)`, `formatRelativeDay(yyyy-mm-dd, tz?)` (returns "Today" / "Tomorrow" / weekday / "Weekday, Month D"), `parseUTCTimestamp(string)`, and `getCanonicalWeekday(date, tz?)`.

Display-side default timezone is `America/Los_Angeles`. Hearth-pos is multi-timezone in reality — every helper takes an optional `tz` argument so per-vendor TZ overrides are first-class. The default is a *fallback*, not a hardcoded global. Never resolve timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone` at a display site — pass it through the helper.

**CROSS-CHECK RULE — MANDATORY**

For every ledger entry, the Cross-check Performed section is mandatory regardless of category. List adjacent paths (other platforms for `expo-rn` bugs, other templates for `template-system` bugs, other Stripe Connect flows for `stripe` bugs, other AI invocation surfaces for `ai-tool-calling` bugs, other files matching the same anti-pattern grep). For each: either fix it in the same commit, or explicitly mark it out-of-scope-but-flagged. Silence in the cross-check section is not acceptable — empty cross-check sections fail review.

## Awareness Patterns

These are not mandatory promoted rules but should inform code review and design choices. They originate from bugs in adjacent Hearth-family repos and apply here as priors.

### Don't ship plausible placeholder data

Unwired props default to `null`, never to plausible-looking placeholder values (e.g., `transactionsCompletedCount = 12`, `vendorRating = 4.7`). Templates render an explicit "unknown" / "learning" state for `null`. The defaults must not survive a code review if they look like real data. *(See harvest-once-app BUG-014: a receipt email shipped with hardcoded "12 meals together" / "94% taste match" as defaults that were never wired; a first-time customer received vendor-like fake metrics, undiscovered for an unknown duration because the values looked real.)*

### Prefer COALESCE / null-check over force-write

Before fixing "column X is not being written at point Y", check whether X has authoritative upstream sources (vendor input via a setter tool, prior state from a referenced row). Prefer `column = existing.column ?? computeDefault()` over `column = computeDefault()`. Force-writing a default is the most common cause of "the system silently ignored what I asked it to do" bugs. *(See harvest-once-app BUG-017: a "fix" for a non-writing column force-wrote a computed default, silently clobbering customer input for four months.)*

## Mobile / React Native Specific Rules

### B.1 Async SDK initialization before user interaction

Async SDK initialization (Stripe React Native, Expo Location, Expo Camera, Expo Notifications, Supabase auth restore) MUST complete before dependent UI is interactive. Show a loading state during init; disable submit-style controls until the SDK exposes a `ready: true` signal. Never let the vendor's first tap be the trigger that starts initialization. Mobile is more sensitive than web because of cold-start and aggressive RN bridge timing.

### B.2 Persist validated state before navigation

In multi-step vendor flows (onboarding, transaction entry, profile edit, payout setup), persist validated input to the canonical store (Supabase, Zustand, or SecureStore as appropriate) at validation time, not at navigation time. Local component state is for in-progress editing; the canonical store is the source of truth between screens. RN back-navigation and unmounts are aggressive — assume any screen can remount and reset its local state at any time.

### B.3 TTS visibility (awareness only)

If/when voice or TTS is added to hearth-pos, text rendering treats voice as additive (subtitles), not exclusive. Don't add `!isSpeaking`-style visibility conditions to text the vendor might want to read along with the audio (deaf-friendly, noisy-environment-friendly, fast-readers-impatient-with-TTS friendly). *(Awareness rule — no TTS surface ships in hearth-pos today; documented here so it lands correctly the first time one does.)*

## Known interim shortcuts

Deliberate, scoped gaps that are wired to be completed later. Each must carry a `TODO(<tag>)` at the seam in code so the follow-up is greppable.

- **TODO(SMS) — phone verification deferred.** Entity creation (`EntitySetupScreen` → `EntityContext.createEntity`) collects and stores `entities.phone` as TEXT but does **not** verify it; phone is stored unverified and phone-confirmation is **not** required for the entity to be created or for signup to complete. No SMS provider is configured (prod auth SMS lives in the Supabase dashboard; `supabase/config.toml` Twilio block is local-only and disabled). When SMS is enabled, wire **Supabase phone OTP** at the `TODO(SMS)` seam (send code → `verifyOtp`) and treat **`auth.users.phone_confirmed_at` as the source of truth** (Decision 1A) — do **not** add a phone-verified column to `entities` (the network reads that table; its shape is frozen). Grep: `grep -rn "TODO(SMS)" src`.
