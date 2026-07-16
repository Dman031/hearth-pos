---
description: Investigation-first development protocol — three-phase Investigate/Report/Implement flow with risk matrix and file-touch rules. Auto-fires on any bug fix, feature build, or code change request.
triggers:
  - "fix"
  - "investigate"
  - "implement"
  - "build"
  - "add feature"
  - "change"
  - "modify"
  - "update"
  - "refactor"
---

# SKILL: Investigation-First Development

## When to Use
Use this skill for ANY bug fix, feature implementation, or code change. No exceptions.

## Why This Exists
Without investigation first:
- Claude claims work is "already done" when it isn't
- Changes touch files outside the intended scope
- Commits contain unrelated modifications
- Fixes break other features because dependencies weren't traced
- Time is wasted re-doing work that was never actually committed

## The Protocol

### Phase 1: Investigate (ALWAYS DO THIS FIRST)
```bash
# 1. Find all relevant code
grep -rn "[search_term]" --include="*.ts" --include="*.tsx" src/screens/ src/components/ src/services/ src/hooks/ 2>/dev/null

# 2. Check recent changes to relevant files
git log --oneline -5 -- [file_path]

# 3. Read the actual current state of each file
cat [file_path] | head -50  # or specific line ranges

# 4. Check if a "fix" was already attempted
git log --all --oneline | grep -i "[feature_name]"

# 5. Verify git status — any uncommitted changes?
git status
git diff --name-only
```

### Phase 2: Report (ALWAYS DO THIS BEFORE CODING)
Produce a structured report with:

1. **Problem**: One sentence
2. **Current state**: File paths, line numbers, what the code does now
3. **Files to touch**: Table with file, change type, risk level
4. **Files NOT to touch**: Explicit exclusion list
5. **The fix**: What specifically changes
6. **Side effects**: What could break
7. **Approval request**: "Ready to implement?"

### Phase 3: Implement (ONLY AFTER APPROVAL)
1. Make the narrowest change possible
2. Compile check: `npx tsc --noEmit`
3. Commit locally: `git add -A && git commit -m "[type]: [desc]"`
4. Do NOT push
5. Report: files changed, line numbers, what was modified

## Risk Assessment Guide

| Risk Level | Criteria | Action |
|------------|----------|--------|
| Low | CSS/style only, no logic change | Report but can batch with other low-risk |
| Medium | Logic change in one file, no side effects | Report and wait for approval |
| High | Touches scoring, payments, auth, or multi-file | Full investigation, detailed report, explicit approval |
| Critical | Database schema, env vars, API keys, deployment | Investigation only — Derrick implements manually |

## File Touch Rules
- If a prompt says "fix X in file A" but investigation shows file B also needs changes, STOP and report — do not silently modify file B
- If a file was modified in the last 24 hours, flag it as potentially unstable
- Never modify files in the DO NOT TOUCH list without explicit override from Derrick

## Common DO NOT TOUCH Files
Unless the prompt specifically names these. Most of these don't exist on Day 0; the list serves as forward guidance for when they do:

- Stripe Connect Express integration — `src/services/stripe.ts`
- Supabase client and auth flow — `src/services/supabase.ts`, `src/hooks/useAuth.ts`
- Brand marks — `src/components/Crest.tsx` + `src/constants/brand.ts` (the canonical Teleoplexy crest/lockup SVGs, design-critical; HearthOrb removed 2026-07-15)
- Template renderer — `src/components/TemplateRenderer.tsx` (changes here affect every business type)
- Design tokens — `src/styles/theme.ts` (changes affect every screen)
- Push notification service — `src/services/notifications.ts` (when it exists)
- The `.env.local` file — never modify, only Derrick edits

## Anti-Patterns to Avoid
- "This was already implemented in a prior session" → PROVE IT with grep/git log output
- "I'll also fix this unrelated issue I noticed" → NO. One issue at a time.
- "Let me restructure this file while I'm here" → NO. Narrowest change only.
- Combining investigation and implementation in one prompt → ALWAYS separate.
- Committing without TypeScript compile check → NEVER.

## Parallel Agentic Development

This repo supports parallel agentic builds across multiple Claude Code terminals.
Follow these rules whenever building in parallel:

- Split work into modules with zero file overlap before launching any terminal
- Each terminal declares its scope upfront — specific files and directories only  
- DO NOT touch any file outside your declared scope, even if it seems related
- Claude Code summary output IS the record — no separate log file needed
- Test the sum: when all terminals finish, run `npm run dev` and walk the full user flow manually
- Investigate first discipline applies to each terminal independently — run investigation before building in every session
- Commit locally to feature branch. Do NOT push to main — Derrick reviews diff and pushes manually.
