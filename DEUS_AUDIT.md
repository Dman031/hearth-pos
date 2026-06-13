# DEUS_AUDIT — Current-state audit of the Hearth codebase

**Date:** 2026-06-01
**Scope:** Read-only investigation ahead of the Hearth → Deus refactor (per-vertical template POS + MCP network → generic "card" AI-addressing directory).
**Method:** Static read of all three code areas. Nothing was built, run, migrated, or modified. The remote Supabase database was **not** queried — schema below is reconstructed from application code and TypeScript types only.

**One-line summary:** The mobile app is a real, working Day-3 Expo build (auth + conversational onboarding + classifier). The MCP network is **empty scaffolding** — every tool/OAuth/route file is a 0-byte stub. The Supabase schema exists **only in the remote project** — there are **no migration files in the repo**, so it cannot be authoritatively read here.

---

## 1. REPO INVENTORY

Two repos exist under `/Users/dadworker/Dev/hearth/`. There is **no third repo** for the Supabase schema — it lives partly as one Edge Function inside `hearth-pos/supabase/` and otherwise only in the remote project.

| Repo | Path | Framework | Builds/runs as-is? | node_modules | Lockfile |
|------|------|-----------|--------------------|--------------|----------|
| hearth-network | `hearth/hearth-network` | Cloudflare Workers (Hono 4.12) + `@modelcontextprotocol/sdk` | Worker boots (`/`, `/health`, `/.well-known/mcp.json` only). **No real functionality.** Default scaffolding test still asserts "Hello World!" and would **fail** against current `index.ts`. | present | `package-lock.json` (137 KB) |
| hearth-pos | `hearth/hearth-pos` | Expo SDK 55 / React Native 0.83 (expo-router + react-navigation) | Yes — real app. `expo start` scripts present. | present (404 entries) | `package-lock.json` (347 KB) |

**Node version:** Not pinned in either repo — no `engines` field, no `.nvmrc`. hearth-network declares `@types/node ^25.9.0` (implies Node 25-era tooling). hearth-pos uses `legacy-peer-deps=true` in `.npmrc`.

**Key dependencies**

- **hearth-network:** `hono ^4.12.19`, `@modelcontextprotocol/sdk ^1.29.0`, `@supabase/supabase-js ^2.106.0`; dev: `wrangler ^4.92.0`, `vitest ~3.2.0`, `@cloudflare/vitest-pool-workers`.
- **hearth-pos:** `expo ~55.0.26`, `react-native 0.83.6`, `react 19.2.0`, `@react-navigation/*`, `@supabase/supabase-js ^2.105.4`, `@stripe/stripe-react-native 0.63.0`, `expo-secure-store`, `expo-camera`, `expo-image-picker`, `expo-notifications`, `react-native-reanimated 4.2.1`, `react-native-svg`, `three ^0.184.0` (HearthOrb).

**Git state:** network is at "Day 0" (3 commits: create-cloudflare init → scaffolding/hello-world → bug-workflow infra). pos is at "Day 3" (auth → 4-tab nav → onboarding/classifier → context refactor → no-WIMP onboarding). Current pos branch: `day3-no-wimp-onboarding`.

---

## 2. THE MCP NETWORK (Cloudflare Workers)

**Headline finding: the network is a skeleton.** Of 30 files under `src/`, only `index.ts` (49 lines) has any content. **All 29 others are 0 bytes** — every tool, every OAuth file, every route, every middleware, every capability, and the supabase client are empty placeholders created but never implemented.

```
0  tools/{book-service, check-availability, create-service-request, find-vendors,
       get-status, get-vendor-details, place-order, process-payment,
       submit-bid, submit-rating}.ts
0  routes/{health, mcp, oauth, well-known}.ts
0  oauth/{client-registration, handler, pkce, tokens}.ts
0  capabilities/{declarations, manifest, ranking}.ts
0  middleware/{auth, cors, logging, rate-limit}.ts
0  utils/{error-handling, supabase-client}.ts
0  types/{mcp, oauth, supabase, tools}.ts
49 index.ts   ← the only real file
```

**Does it deploy?** Mechanically yes — `wrangler deploy` would publish the Hono app. Functionally it serves only three GET endpoints.

**wrangler config** (`wrangler.jsonc`): worker name `hearth-network`, `main: src/index.ts`, `compatibility_date 2026-05-19`, `compatibility_flags: ["nodejs_compat"]`, observability + source maps on. **No `routes`, no `route`, no custom-domain / `workers.dev` block.** The `.well-known` doc hardcodes the intended domain `mcp.hearth.network`, but **nothing in wrangler is configured to bind that domain** — it would deploy to a default `*.workers.dev` URL.

**MCP tools implemented:** **None.** `index.ts` serves `/.well-known/mcp.json` with a literal `tools: []`. The 10 tool files exist by name only (see list above) and are empty. The intended surface, inferred from filenames: `find-vendors`, `get-vendor-details`, `check-availability`, `create-service-request`, `submit-bid`, `book-service`, `place-order`, `process-payment`, `get-status`, `submit-rating`.

**Transport:** `.well-known/mcp.json` declares `"transport": "streamable-http"`. (Not SSE.) But there is **no transport handler** — `routes/mcp.ts` is empty. So it is declared, not implemented.

**OAuth state:** **Nothing implemented.** `.well-known` advertises `oauth2.1` with `authorization_endpoint` / `token_endpoint` / `registration_endpoint` under `mcp.hearth.network/oauth/*`, but `oauth/pkce.ts`, `oauth/handler.ts`, `oauth/tokens.ts`, `oauth/client-registration.ts`, and `routes/oauth.ts` are **all empty**. No PKCE, no stub, no handler — just the advertised intent. There is an `OAUTH_SIGNING_KEY` secret reserved (see below).

**Cloudflare secrets referenced** (names only — from the `Bindings` type in `index.ts` and `.dev.vars` keys):

| Secret | Purpose (inferred) |
|--------|--------------------|
| `SUPABASE_URL` | Supabase project endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role reads/writes (RLS bypass) |
| `ANTHROPIC_API_KEY` | Claude (ranking / matching) |
| `OAUTH_SIGNING_KEY` | Sign/verify OAuth tokens (unused — OAuth not built) |
| `STRIPE_SECRET_KEY` | Payment processing (unused — tools not built) |

---

## 3. SUPABASE SCHEMA

**Headline finding: there are no schema files in the repo.** No `*.sql`, no `supabase/migrations/`, no `CREATE TABLE`, no `CREATE POLICY` anywhere in either repo. `supabase/` contains only `config.toml`, the `classify-business` Edge Function, and `.temp/` CLI link state. **The live schema is not reproducible from this codebase** — it exists only in the remote project (`ref: lfznznuqspeabfmsczqc`, name "Hearth-Network( POS)").

What follows is **reconstructed from application code and TS types**, not from DDL. Treat column types as best-effort inferences.

### Tables actually referenced in code

Only **two** tables are touched by any code (`.from()` calls across both repos):

#### `pos_templates` — read in 3 places (`template-loader.ts`, Edge Function)
Template-era. Drives the per-vertical POS rendering and the onboarding classifier.

| Column | Type (inferred) | Notes |
|--------|-----------------|-------|
| `id` | text PK | e.g. `generic_service`, `plumber`, `coffee_shop`, `task_runner` |
| `category` | text | |
| `display_name` | text | |
| `match_keywords` | text[] / jsonb | classifier keyword hints |
| `config` | jsonb | `TemplateConfig` (see below) |
| `version` | int | |
| `is_active` | boolean | only active rows are loaded |

`TemplateConfig` shape (`src/types/templates.ts`): `profile_fields[]`, `ticket_format` (`direct|bid|recurring|order|task|dispatch_outbound`), `features: Record<string,boolean>`, `home_screen[]`, `menu_config?`, `onboarding_conversation[]`, `mcp_capabilities[]`.

#### `vendor_profiles` — read + insert (`VendorContext.tsx`)
The single per-vendor row. Full shape from `src/types/vendor.ts` (types are author-annotated with the DB types):

| Column | Type | Default / notes |
|--------|------|-----------------|
| `id` | uuid PK | |
| `user_id` | uuid FK → `auth.users` | one profile per auth user |
| `business_name` | text null | |
| `category` | text null | |
| `description` | text null | |
| `service_area` | jsonb | `'[]'` |
| `hours_of_operation` | jsonb null | |
| `photos` | jsonb (string[]) | `'[]'` |
| `rating` | numeric(3,2) | `0` |
| `rating_count` | int | `0` |
| `response_time_minutes` | int null | |
| `completion_rate` | numeric(5,2) | `100` |
| `cancellation_rate` | numeric(5,2) | `0` |
| `is_live` | boolean | `false` |
| `stripe_account_id` | text null | Stripe Connect (not yet wired client-side) |
| `template_id` | text FK → `pos_templates` null | null ⇒ onboarding unfinished |
| `completed_transaction_count` | int | `0` — paywall trigger at 10 |
| `subscription_status` | enum `free\|active\|cancelled` | `free` |
| `stripe_subscription_id` | text null | |
| `mcp_capabilities` | jsonb | `'[]'` |
| `referral_code` | text **unique** null | app generates 6-char code, retries on `23505` |
| `available_for_tasks` | boolean | `false` |
| `task_radius_miles` | int null | |
| `task_types_accepted` | jsonb | `'[]'` |
| `created_at` / `updated_at` | timestamptz | |

### Tables that are NAMED but never touched
The empty network tool files imply tables like `service_requests`, `bids`, `orders`, `transactions`, `ratings`, `availability` — but **no code reads or writes them**, and no DDL defines them. Whether they exist in the remote DB is **unknown from the repo**.

### RLS policies
**Not determinable from the repo** — no policy SQL exists here. Behavioral evidence that RLS is in force:
- `VendorContext` inserts with `.select().single()` and treats failure as an error (the project's "Supabase write rule"), consistent with a `user_id = auth.uid()` insert/select policy on `vendor_profiles`.
- The Edge Function loads `pos_templates` with the **service-role key** "(bypasses RLS)" per its own comment, implying `pos_templates` is RLS-protected from the anon key — yet `template-loader.ts` reads it from the **app with the anon key**, so there must also be an anon read policy (likely `is_active = true`). This anon-vs-service-role split is worth confirming against the live DB.

### Generic "cards"/"nodes" table?
**No.** Nothing resembling a generic card/node model exists. The data model is entirely per-vertical: `pos_templates` (vertical configs) + one wide `vendor_profiles` row whose columns hardcode POS/booking/task concepts (`rating`, `completion_rate`, `task_radius_miles`, `stripe_*`, `mcp_capabilities`).

### Reusable vs. template-era

| Table | Verdict for the card model |
|-------|----------------------------|
| `vendor_profiles` | **Partially reusable as the "owner/account" record.** Identity columns (`id`, `user_id`, `stripe_account_id`, `referral_code`, `subscription_status`, billing counters) carry forward. The vertical columns (`rating`, `service_area`, `task_*`, `hours_of_operation`, `category`) become **cards/fields**, not columns. |
| `pos_templates` | **Template-era — replace.** This is the per-vertical mechanism the refactor explicitly removes. Useful only as seed inspiration for default card layouts. |
| `service_requests` / `bids` / `orders` / `transactions` / `ratings` (if they exist remotely) | **Template-era — likely drop or fold into cards/permissions.** |

---

## 4. THE MOBILE APP (Expo)

**Status:** real and runnable, but most surfaces are still stubs. Of 50 `src/` files, ~20 have real content; the rest are 0 bytes.

### Navigation
- **Root routing** (`App.tsx`): not tab-first. `Root` gates on state: loading → `SplashScreen` (HearthOrb); no user → `AuthScreen`; user with `vendor === null` or `template_id === null` → `OnboardingScreen`; otherwise → `NavigationContainer` + `TabNavigator`.
- **Tabs** (`TabNavigator.tsx`): 4 bottom tabs — **Home, Inbox, Jobs, Money** (text-letter icons H/I/J/M, dark theme).
- **Provider stack:** `GestureHandlerRootView → SafeAreaProvider → AuthProvider → VendorProvider → Root`.

### Screens — real vs stub

| Screen | Lines | State |
|--------|-------|-------|
| `OnboardingScreen` | 693 | **Real** — conversational "no-WIMP" onboarding |
| `AuthScreen` | 267 | **Real** — email/password UI |
| `HomeScreen` | 51 | Minimal real (welcome + sign-out) |
| `InboxScreen` / `JobsScreen` / `MoneyScreen` | 36 each | **"Coming soon" placeholders** |
| `ProfileScreen` / `SettingsScreen` / `TaskFeedScreen` | 0 | **Empty stubs** |

### Components — real vs stub
- **Real:** `ConversationBubble` (330), `HearthOrb` (153).
- **Empty (0 bytes):** `AvailabilityToggle`, `BidForm`, `EarningsCard`, `JobCard`, `PhotoUploader`, `ReferralBadge`, `TaskFeed`, `TemplateRenderer`, `TicketCard`, `TransactionCounter`. (Note: `TemplateRenderer` — central to the template system per CLAUDE.md — **is not implemented.**)

### Services — real vs stub
- **Real:** `supabase.ts` (32), `classifier.ts` (101, thin Edge-Function client), `template-loader.ts` (220, cached `pos_templates` loader).
- **Empty (0 bytes):** `stripe.ts`, `paywall.ts`, `notifications.ts`, `bid-engine.ts`, `task-matcher.ts`.

### Hooks
`useAuth`, `useVendor` (thin wrappers over the two Contexts), plus `useEarnings`, `useJobs`, `useReferrals`, `useTasks`, `useTemplate`, `useTickets` (existence noted; the data tables/services behind most are stubs).

### Design system / theme (`src/styles/theme.ts`)
Matches CLAUDE.md. Color tokens:

| Token | Value | | Token | Value |
|-------|-------|-|-------|-------|
| background | `#050505` | | accent | `#D4A574` |
| surface | `#111111` | | success | `#5DCAA5` |
| textPrimary | `#F5F0E8` | | danger | `#E24B4A` |
| textSecondary | `#A5A99A` | | warning | `#EF9F27` |
| textMuted | `#7D8471` | | | |

Orb palette: warmCore `#fff8e2`, goldMid `#d2be91`, deepGold `#b89e61`, sageEdge `#7d8471`, darkSage `#595e51`, glow `rgba(210,190,145,0.05)`.
Border radius: card 12, input 24, pill 999. Spacing xs4→xxxl48. Typography scale displayLarge 48 → caption 12. **Font:** system sans-serif (no custom font family set). `as const` typed export.

### Supabase client setup (`src/services/supabase.ts`)
`createClient` with an **expo-secure-store** storage adapter, `autoRefreshToken`, `persistSession`, `detectSessionInUrl: false`. Reads `process.env.EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` and **throws at module load** if either is missing (matches the project's `requireEnv` rule). Env vars come from `.env.local` via Expo's `EXPO_PUBLIC_` bundling.

**Auth flow** (`AuthContext.tsx`): Supabase **email/password** (`signInWithPassword`, `signUp`, `signOut`) with `onAuthStateChange` session restore. **Google and Apple sign-in are TODO stubs** that return `new Error('Sign-in provider not yet configured')`.

### Stripe integration
- `app.json`: `@stripe/stripe-react-native` plugin configured (`merchantIdentifier: merchant.com.hearth.pos`, Google Pay off). SDK is a dependency.
- **No Stripe code is wired.** `src/services/stripe.ts` is **empty**. No Connect onboarding, no Identity, no PaymentSheet, no subscription/paywall logic exists client-side. `vendor_profiles.stripe_account_id` / `stripe_subscription_id` are never written by app code. This contradicts the CLAUDE.md "ALWAYS use Stripe Connect Express" rule only in the sense that it is **not yet built**.

---

## 5. CREDENTIALS & CONFIG (names only)

> No secret values are reproduced here. Values live in `.dev.vars` (network, gitignored), `.env.local` (pos, gitignored), Supabase secrets, and Cloudflare secrets.

| Name | hearth-network (`.dev.vars` / Bindings) | hearth-pos (`.env.local`) | classify-business Edge Fn (`Deno.env`) |
|------|:--:|:--:|:--:|
| `SUPABASE_URL` | ✓ | — | ✓ (auto-injected) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | — | ✓ (auto-injected) |
| `SUPABASE_ANON_KEY` | — | — | ✓ (auto-injected) |
| `EXPO_PUBLIC_SUPABASE_URL` | — | ✓ | — |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | — | ✓ | — |
| `ANTHROPIC_API_KEY` | ✓ | ✓ (legacy; now server-side) | ✓ (required) |
| `ANTHROPIC_MODEL` | — | ✓ | ✓ (default `claude-opus-4-7`) |
| `OAUTH_SIGNING_KEY` | ✓ | — | — |
| `STRIPE_SECRET_KEY` | ✓ | ✓ | — |
| `STRIPE_PUBLISHABLE_KEY` | — | ✓ | — |
| `STRIPE_PRICE_ID_POS` | — | ✓ | — |

Notes:
- `ANTHROPIC_API_KEY` and `STRIPE_SECRET_KEY` appear in **`.env.local`** of the mobile app. Anything not prefixed `EXPO_PUBLIC_` is **not** bundled into the client, so these are effectively unused by the app at runtime (the key was moved server-side into the Edge Function — see `classify-business` header comment). **Flag:** secret keys sitting in a client repo's env file are a smell even if unbundled; confirm they're not referenced anywhere client-side. (Grep confirms `classifier.ts` no longer imports the Anthropic SDK.)
- Supabase project ref: `lfznznuqspeabfmsczqc` (`supabase/.temp/linked-project.json`).
- Stripe merchant id: `merchant.com.hearth.pos` (`app.json`).

---

## 6. WHAT CARRIES FORWARD vs. WHAT GETS REPLACED

### Carries forward (convert directly / keep)

| Piece | Why it carries |
|-------|----------------|
| **Auth** (`AuthContext`, Supabase email/password, secure-store session) | Identity is model-agnostic. Reusable as-is; only Google/Apple still need finishing. |
| **Supabase client + env discipline** (`supabase.ts`, throw-on-missing-env, write-rule conventions) | Backend stays Supabase; client setup is generic. |
| **Design system** (`theme.ts`, HearthOrb, ConversationBubble) | Pure presentation, no vertical assumptions. Direct carry. |
| **Conversational onboarding** (`OnboardingScreen`, no-WIMP flow) | The *mechanism* (chat-driven profile build) maps cleanly onto "build me a card by talking." Re-target outputs from template selection → card creation. |
| **Edge Function pattern** (`classify-business`: JWT-gated, server-side key, defensive parsing) | The server-side-Anthropic pattern is exactly what card-field extraction will reuse. Keep the harness; change the prompt/output. |
| **Stripe scaffolding** (plugin config, env names, `stripe_account_id` columns) | Connect/Identity intent is correct; nothing built to throw away. Build forward, don't rewrite. |
| **MCP network scaffolding** (Hono app, `.well-known`, secret bindings, file skeleton) | It's an **empty** skeleton, so it carries forward as a *starting point* rather than as code — directory layout, transport choice (streamable-http), and secret names are reusable decisions. |
| **`vendor_profiles` identity columns** | `id`, `user_id`, `referral_code`, `subscription_status`, `stripe_*`, `completed_transaction_count` become the account record under cards. |

### Replaced (template-era)

| Piece | Why it goes |
|-------|-------------|
| **`pos_templates` table + `TemplateConfig`** | The per-vertical template engine is precisely what the generic card model removes. |
| **`template-loader.ts` + `useTemplate` + `TemplateRenderer`** (renderer is unbuilt anyway) | Render-from-template-config is superseded by render-from-cards. |
| **Classifier as "business → vertical category"** (`classifier.ts` + `classify-business` *output contract*) | Vertical classification disappears; the **infra** stays, the **purpose** changes (→ field/card extraction). |
| **Vertical columns on `vendor_profiles`** (`rating`, `completion_rate`, `cancellation_rate`, `service_area`, `hours_of_operation`, `task_radius_miles`, `task_types_accepted`, `category`) | These become user-named fields inside cards, not first-class columns. |
| **Named-but-empty network tools** (`find-vendors`, `book-service`, `submit-bid`, `place-order`, …) | These encode the booking/POS verbs. Deus tools will be card-shaped (discover/read/act-on cards under permission axes). Since they're empty, "replace" = "don't write them; write card tools instead." |
| **`mcp_capabilities` jsonb on vendor_profiles** | Capabilities move to cards + the two permission axes (who-can-see / who-can-act). |

### Net read
The **mobile app is the asset** — auth, design system, conversational onboarding, and the Edge-Function pattern transfer almost unchanged. The **MCP network is greenfield** dressed as a repo (empty stubs + correct decisions). The **schema is the work** — it's not in the repo, it's per-vertical, and the card model is a from-scratch design, not a migration of existing tables.

---

## GAPS & QUESTIONS

**Could not determine (read-only, repo-only limits):**

1. **The actual live schema.** No migrations/DDL in the repo. Every table/column/type/constraint above is reconstructed from TS types and query code. The remote DB (`lfznznuqspeabfmsczqc`) may contain tables (`service_requests`, `bids`, `transactions`, etc.) that **no code references** and that this audit cannot see. *Recommend dumping the live schema (`supabase db dump` / pg introspection) before Phase 01.*
2. **All RLS policies.** Zero policy SQL in the repo. Inferred only behaviorally. The anon-key (app) vs service-role (Edge Fn) read split on `pos_templates` especially needs confirmation.
3. **Whether `pos_templates` is actually seeded** with the 4 launch templates (`generic_service`, `plumber`, `coffee_shop`, `task_runner`) — referenced in CLAUDE.md and the fallback constant, but seed data isn't in the repo.
4. **Network deploy target.** `wrangler.jsonc` has no route/custom-domain. Is `mcp.hearth.network` actually configured (in the Cloudflare dashboard, out of band), or is the worker only on `*.workers.dev`?
5. **harvest-once repo** (`/Users/dadworker/Dev/harvest-once`) exists as a sibling and is referenced heavily in CLAUDE.md bug lore, but is **out of scope** for the three-repo audit. Confirm it's unrelated to Deus.

**Decisions to make before Phase 01 (schema refactor):**

1. **`vendor_profiles`: migrate or fork?** Does the card model extend the existing table (keep identity columns, drop vertical ones, add card/permission tables) or start a fresh `accounts` + `cards` schema and backfill? Today there's likely little production data, which favors a clean schema.
2. **Card storage shape.** Confirm the target: a `cards` table (`id`, `owner_id`, `title`, `fields jsonb`, `visibility` axis, `actability` axis, `verification_status`) — and whether `fields` stays jsonb (matches the current jsonb-heavy style) or normalizes into a `card_fields` table.
3. **Two permission axes → RLS design.** "Who can see" / "who can act" need a concrete enforcement model (enum? per-card ACL rows? a `SECURITY DEFINER` function per the project's own RLS rule). This is the highest-risk design choice and currently has **zero precedent in the repo**.
4. **Verification status semantics.** What states (`unverified` / `pending` / `verified` / `revoked`?), who sets them, and is Stripe Identity the verifier — given Stripe is configured but unbuilt?
5. **Classifier repurpose vs. retire.** Keep the `classify-business` Edge Function harness and re-point it at card-field extraction, or retire it? (Recommend keep the harness, change the contract.)
6. **Network: build on the stub or restart?** The skeleton is empty. Decide whether to keep the file layout / streamable-http / OAuth-2.1 decisions or regenerate from a current MCP template, since none of it is implemented yet.
7. **MCP terminology exposure.** CLAUDE.md forbids exposing MCP/protocol terms to vendors. The Deus "AI-addressing directory" framing changes the vendor-facing language — confirm the card UI keeps that wall.

---

*End of audit. No files were modified, created (other than this report), renamed, or deleted; nothing was built, migrated, or deployed.*
