---
name: bug-tracker
description: Document, cross-reference, and prevent recurrence of bugs in hearth-pos. Use this skill proactively whenever a bug is identified, diagnosed, reproduced, or fixed — including whenever Derrick says "debug", "broken", "failing", "not working", "fix this", "something's off", "just fixed", "log this bug", "check archive", "any bugs about X", "has this happened before", or any variant. Must fire in BOTH directions — BEFORE proposing any fix (grep BUGS_AND_SOLUTIONS.md for prior occurrences) AND AFTER resolving a bug (append entry with full metadata). Never skip the archive check, even for "obvious" bugs — those are exactly the recurring ones. Also use when classifying a bug's introduction source (Claude-prompt, Claude-fix, subagent, human, upstream, regression) for the prompt-quality feedback loop.
---

# Bug Tracker — Hearth POS

Single source of truth for recurring issues in hearth-pos. Every bug gets checked against `BUGS_AND_SOLUTIONS.md` at the repo root before a fix is proposed, and every resolution gets appended before the commit ships.

## When This Skill Fires

Two directions. Both are mandatory.

**Direction 1 — BEFORE a fix is proposed:** any time a bug, failure, error, or unexpected behavior is raised. Grep the archive, report findings, then propose a fix.

**Direction 2 — AFTER a fix is resolved:** any time a bug is confirmed resolved. Draft the ledger entry, confirm with Derrick, append to file.

Skip Direction 1 and you waste cycles re-solving solved problems. Skip Direction 2 and the feedback loop breaks.

---

## Workflow 1: Before Proposing a Fix

### Step 1 — Extract Search Terms

From the bug report, pull distinctive terms:
- Exact error messages (Supabase 406s, Stripe Connect errors, Expo module exceptions, Anthropic API errors, EAS build errors)
- Affected file paths or component names
- Feature names (TemplateRenderer, paywall trigger, vendor onboarding, `completed_transaction_count`, referral kickback, etc.)
- Symptoms the vendor sees ("can't onboard", "subscription didn't activate at transaction 10", "wrong template fields rendering", "payment fails silently")

### Step 2 — Grep the Archive

At least two searches — one narrow (exact error string), one broad (feature/file):

```bash
grep -i -B2 -A15 "<exact-error-or-symptom>" BUGS_AND_SOLUTIONS.md
grep -i -B2 -A15 "<feature-or-file>" BUGS_AND_SOLUTIONS.md
```

An empty archive is not a reason to skip the grep — it just means the grep returns nothing and you proceed.

### Step 3 — Report Findings to Derrick

Use this exact format:

```
Archive check: [N] matches found.

[If matches:]
- BUG-XXX ([date]): [one-line summary]. Fix was: [one-line].
  Relevance: [recurrence | variant | side-effect | unrelated]
- BUG-YYY ([date]): ...

[If 3+ matches of the same pattern:]
⚠️ PROMOTION CANDIDATE: This symptom has been fixed [N] times.
Recommend promoting to a hardcoded rule in CLAUDE.md before patching again.

[If no matches:]
No matches. This appears to be new. Proceeding to investigation.
```

### Step 4 — Proceed to Investigation

Only after Step 3. For bugs that match a prior entry, state explicitly whether the prior fix is still in place (check git blame on the mentioned files) or whether it regressed.

---

## Workflow 2: After Resolving a Bug

### Step 1 — Confirm Resolution

A bug is resolved when:
- The reproduction steps no longer produce the symptom
- **Ground truth is DB state**, not `toolUsed`, not a green test, not "it looks right"
- Adjacent code paths (see Cross-Check section below) have been inspected

### Step 2 — Draft the Entry

Use the template in the next section. Every field in the metadata block is required. The `Introduced-by` field breaks the feedback loop if omitted.

### Step 3 — Confirm with Derrick

Show the drafted entry before appending. He reviews, corrects, approves.

### Step 4 — Append and Commit

Append to `BUGS_AND_SOLUTIONS.md`. The ledger entry and the fix commit ship in the same commit or back-to-back commits. Never defer.

---

## Entry Template

```markdown
## BUG-NNN: [Short Descriptive Title]

**Status:** FIXED | MITIGATED | MONITORING | OPEN
**Date:** YYYY-MM-DD
**Severity:** Critical | High | Medium | Low
**Category:** [from taxonomy below]
**Introduced-by:** [from taxonomy below]
**Related bugs:** [BUG-IDs or "none"]

### Symptoms

- [What the vendor/Derrick sees]
- [Error message verbatim, in code block]
- [Log output if relevant]

### Root Cause

[Technical explanation — why it happened, not just what happened. Reference the specific line/function if possible.]

### Solution

[What changed.]

### Files Changed

- `path/to/file.ts` — [what changed]
- `path/to/other.tsx` — [what changed]

### Commits

- `<sha>` — [commit message]

### Verification

[How we confirmed the fix — DB query, test command, or reproduction steps that now pass.]

### Cross-check Performed

- [Adjacent path 1 inspected — e.g., "other template type checked, same pattern not present"]
- [Adjacent path 2 inspected]

### Prevention

[Rule, convention, or test added. If 3rd+ recurrence, note promotion-to-CLAUDE.md candidacy.]

### Prompt/Subagent Notes
*(Only if Introduced-by is Claude-related)*

[Which prompt or subagent produced this? What was the flaw? What should have been in the prompt?]
```

---

## Category Taxonomy

Use the closest match. If no category fits, propose a new one and flag for review.

| Category | Covers |
|----------|--------|
| `supabase` | RLS policies, `.single()` vs `.maybeSingle()`, auth, migrations, triggers, SECURITY DEFINER |
| `stripe` | Stripe Connect Express, vendor onboarding (account link / KYC), payouts, saved payment methods, the paywall trigger ($50/mo activation at transaction 10), the 1.5% application fee, household referral kickback |
| `ai-tool-calling` | Lazy tool-calling, hallucinated responses, wrong tool selected, missing trigger phrases, forced `tool_choice` misuse, Opus invocation surfaces (onboarding turns + vendor-data classification) |
| `template-system` | `pos_templates` JSON drift, TemplateRenderer rendering wrong fields, template-gated features leaking, template extension or migration issues |
| `expo-rn` | Expo modules (Location, Camera, Notifications, SecureStore), iOS vs Android divergence, navigation/unmount races, async SDK init, native permission flows |
| `auth-oauth` | Supabase auth, biometric, OAuth flows, session restore via SecureStore |
| `deployment` | EAS builds, Expo updates, App Store / Play Store submissions, env var bundling |
| `test-construction` | Bugs in tests, not in prod — assertion shape errors, mock/prod divergence |
| `subagent-scope` | Subagent modified code outside stated scope |
| `ui-design` | Color drift, font drift, state rendering, animation glitches, design-system violations |
| `performance` | Slow queries, re-renders, bundle size, cold-start time |
| `copy-content` | Wrong text displayed, tier messaging mismatch, tone violations, MCP/protocol terminology leaking to vendor |

---

## Introduced-By Taxonomy

Every entry picks exactly one.

| Tag | Meaning |
|-----|---------|
| `human-error` | Direct human mistake |
| `claude-prompt` | Bug introduced because a Claude-generated *build prompt* had a flaw — even though the prompt was executed correctly |
| `claude-fix` | Bug introduced by Claude-generated *code output* (the prompt was fine, the code was wrong) |
| `subagent-scope-creep` | Subagent modified files outside stated scope |
| `upstream-dependency` | Third-party library update, API contract change, deprecation |
| `regression` | Broke something previously working — **must** reference the prior BUG-ID |
| `unknown` | Genuinely ambiguous. If used 3+ times in a week, investigate process |

**Why this field matters:** when `claude-prompt` or `claude-fix` tags appear 3+ times in a short window, that's the signal to revise the build-prompt pattern — not just the bug. "Investigate before building" becomes measurable.

---

## Cross-Check Section (Mandatory)

Per CLAUDE.md's `CROSS-CHECK RULE — MANDATORY`, this section is required in **every** ledger entry regardless of category — even when none of the category-specific guides below apply. Silence is not acceptable.

Category-specific known parallel paths:

**`stripe` category:** Check the Stripe Connect Express flows that touch the affected surface — vendor onboarding (account link creation, KYC completion), transaction charge path (one-off + saved payment method), subscription paywall trigger ($50/mo activation at transaction 10), 1.5% application fee handling. If household referral kickback is in scope, check that flow too.

**`ai-tool-calling`:** Check both Opus invocation surfaces — conversational onboarding turns AND vendor-data classification. A prompt fix in one must land in the other.

**`template-system`:** Check every launch template that exposes the affected field/feature — `generic_service`, `plumber`, `coffee_shop`, `task_runner`. Plus the TemplateRenderer's feature-gating defaults (the "NEVER show features the template has disabled" rule from CLAUDE.md).

**`expo-rn` (platform parity):** Check both iOS and Android. RN behavior diverges on AsyncStorage, Keyboard, SafeAreaView, Camera, push-notification permissions, and deep links. A fix verified on one platform must be re-verified on the other.

**`supabase` (RLS):** Check both vendor-session context (anon-key, RLS-gated) and any service-role write paths (Stripe webhooks, paywall activation cron, referral kickback cron). `SECURITY DEFINER` functions (e.g., `is_vendor(uuid)`) for anything that would otherwise recurse on `vendor_profiles`.

The cross-check result goes in the entry even if it's "no issue in adjacent path."

---

## Promotion Rule

When a bug pattern recurs 3+ times (count = 3 entries with the same root cause), the fix gets promoted from the ledger into a hardcoded rule in `CLAUDE.md` under "Promoted Rules."

**Process:**
1. Skill identifies the 3rd recurrence in Workflow 1 Step 3 (flag as "⚠️ PROMOTION CANDIDATE")
2. Stop proposing a fix
3. Draft a one-line rule for `CLAUDE.md` (imperative mood, no hedging)
4. Derrick approves
5. Rule goes into `CLAUDE.md` under "Promoted Rules." Future occurrences prevented at prompt-time, not caught at bug-time
6. Prior bug entries get a note: `Promoted to CLAUDE.md rule on YYYY-MM-DD`
7. **Per CLAUDE.md's "When Promoting a Rule" sub-section (Bug Protocol):** the promoted rule ships with a grep command in its prevention notes that finds every site in the codebase where the rule applies, and a one-time codebase sweep is performed in the same commit window. Harvest-once-app BUG-022 is the canonical example of what happens when this step is skipped — the file that spawned the rule sat unfixed for weeks because no one swept it.

---

## Numbering Convention

- Sequential per repo: `BUG-001`, `BUG-002`, ...
- Never reuse an ID. Corrections in place with `Correction (YYYY-MM-DD):` note
- Deleted entries leave a tombstone: `BUG-XXX: [DELETED on YYYY-MM-DD — reason]`
- Cross-repo bugs (same root cause in hearth-pos and harvest-once-app or hearth-network) get their own ID per repo; reference each other in "Related bugs"

---

## What This Skill Does NOT Do

- Replace testing. Tests catch bugs pre-deploy; this archive catches recurrence patterns
- Document feature requests, design decisions, or "things we might want to change." Those go in a separate backlog
- Track every console warning. Only bugs with observable user impact, broken CI, or data integrity concerns
