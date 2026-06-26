# Day 16 — Incoming + PlexChat — LOCKED SPEC (16a / 16b)

**Status:** approved, pre-migration. This document is the single source of truth.
If anything in a chat or an agent's re-derivation conflicts with THIS, this wins —
EXCEPT where this conflicts with the DEPLOYED schema, in which case deployed reality
wins and this doc must be corrected (see the from_entity_id note).
Drop this in BOTH repos and read it at the start of every 16a/16b session to ground.

## What this is

The RECEIVE side of the network + the conversation layer.
- Incoming = the first-contact consent gate (the "knock"). Clean triage.
- PlexChat = the conversation that follows, a tab next to Incoming.
- They are ONE FLOW joined at Accept. PlexChat is also a network-native thread
  reachable (crudely, V1) from an LLM connector.

Mission framing: Incoming closes the loop the network was missing (an LLM can find +
reach an entity; now the entity can RECEIVE and respond). PlexChat is the cross-LLM
conversation layer ("text my wife from ChatGPT, she reads in Claude").

Current-state note: there is NO messages table today. message-routing schema is threads
+ inbound only (0001_routing_inbound_threads.sql); 0001's design note defers persisted
message history. 16a/16b is forward-looking net-new. respond_to_inbound and post_message
are NET-NEW RPCs (the existing tool is respond_thread, untouched in 16a).

## The locked decisions

1. Labels: Accept / Decline — universal on every tile. NO "86 / Counter / Pass" jargon.
2. Seam: Accept (with optional line) OPENS a PlexChat thread AND writes the optional line
   as message #1 (a REAL persisted message, NOT imprint-only). Decline -> no thread, no message.
3. Model B routing (network-side, in reach_entity):
   - FIRST contact (no established thread) -> recipient's Incoming (consent gate).
   - ESTABLISHED thread -> message goes STRAIGHT to PlexChat (post_message), NO Incoming
     tile. Enforced at the write — Incoming tab needs zero routing logic.
4. Tile types: card-reach -> reach/booking/order tile (card attached). Plain text (no card)
   -> kind='message' tile. inbound.card_id becomes nullable.
5. Response architecture = Seam C: two SECURITY DEFINER Postgres RPCs (respond_to_inbound,
   post_message) are the single canonical write path, shared by the app (anon-key JWT,
   self-authorizing via auth.uid()) AND the network (service-role, explicit actor). Net-new;
   no prior SECURITY DEFINER RPC precedent in repo; built on the standard Supabase auth.uid()
   definer pattern. NO Worker API route, NO app-facing HTTP
   surface, NO JWT middleware. App reads via SELECT RLS + Realtime; writes via the two RPCs only.
6. Nav = 4 tabs: Profile / Incoming / PlexChat / Contacts. Identity is NOT a tab — it folds
   into Profile (a "My ID" section) at Day 17. Remove the placeholder Identity tab, add PlexChat.
7. Search is CUT. In-app network search (app calls query_cards) is DEFERRED — it forced the
   Worker API layer and the CF-binding problem. Later "standalone search / outbound reach", not V1.
8. Group/multi-party threads DEFERRED — pairwise model (participant_a/b) can't extend to N.
   Future own-migration; first driver likely B2V dispatch. Logged in DEFERRED.md.

## V1 / V2 line (do not blur)

- V1 (16a + 16b, BUILD NOW): human-operated. A human writes each message; the AI carries it.
  PlexChat lives in the app tab. The LLM connector path is a CRUDE PULL-LOOP (ask "any
  messages?" -> read -> reply -> re-ask). Acceptable.
- V2 (DEFER — the funded "wow," name-only): the seamless SDK surface — in-LLM alerting/push,
  conversational network search inside the AI, a persistent in-LLM panel, and "your AI answers
  FOR you" (autonomy). Builds ON TOP of V1's messages table + the two RPCs + the get/post
  tools. No rework, IF the schema is right now (see origin column).

## THE MESSAGES TABLE SCHEMA (the measure-twice artifact — get this EXACT)

    messages
      id              uuid PK default extensions.uuid_generate_v4()
      thread_id       uuid NOT NULL -> threads(id) ON DELETE CASCADE
      from_entity_id  uuid NOT NULL -> entities(id) ON DELETE CASCADE   -- matches deployed convention
      body            text NOT NULL
      origin          message_origin NOT NULL DEFAULT 'human'
      inbound_id      uuid NULL -> inbound(id) ON DELETE SET NULL        -- provenance of msg #1
      read_at         timestamptz NULL                                  -- ON MESSAGES (per-message), NOT on threads
      created_at      timestamptz NOT NULL default now()

    indexes:
      (thread_id, created_at)                      -- thread-view ordering
      (thread_id) where read_at is null            -- cheap unread counts

Column name = from_entity_id, NOT sender_entity_id. The DEPLOYED schema uses from_entity_id
(inbound, 0001:49; reach-entity.ts:151). Match it — one name network-wide.
SECURITY (load-bearing): from_entity_id was the subject of a past impersonation-hole fix
(BUGS_AND_SOLUTIONS.md:150-191 — removed from tool INPUT schemas to kill spoofing). On messages
it MUST be set SERVER-SIDE — from auth.uid() for app calls, from the explicit service-role actor
for network calls — NEVER from client input. The two RPCs derive it server-side; keep it that way.

message_origin enum = ('human','ai','system') — NOT ('app','mcp','system'). V2-critical. Encodes
AUTHORSHIP (human vs AI wrote it), NOT transport. V1 always writes 'human'. V2's "AI answers for
you" writes 'ai' with no migration. 'system' = auto-notices. Wrong values force a future enum
migration (Postgres can't drop enum values). Net-new — nothing to conflict with.

read_at lives on MESSAGES (per-message), not on threads. Net-new; more flexible for V2.

## SCHEMA CHANGES (the 16a migration, applied in TWO blocks)

Block A (run FIRST, standalone, must commit before Block B):

    alter type public.inbound_kind add value if not exists 'message';

(Postgres forbids using a newly-added enum value in the same transaction that added it.)

Block B (run SECOND, in a begin;...commit;):
1. create type message_origin as enum ('human','ai','system');
2. the messages table + 2 indexes (schema above; from_entity_id)
3. alter table inbound alter column card_id drop not null;
4. alter table threads add column established_at timestamptz;   (Model B signal)
   — read_at is on MESSAGES, NOT threads. Do not add threads.read_at.
5. enable RLS on messages; SELECT policies on inbound (own) + messages (participant).
   NO insert/update policies — writes are RPC-only by design.
   Includes TWO SECURITY DEFINER RLS helper functions — current_entity_id() (auth.uid()->entity)
   and is_thread_participant(thread_id) — so the policies resolve identity WITHOUT selecting the
   RLS-guarded entities/threads tables under the querying user (avoids the RLS self-block, per the
   CLAUDE.md definer-helper rule). The RPCs reuse current_entity_id() too. They EXIST — don't re-add.
6. realtime: replica identity full on inbound; guarded publication adds for both tables.
7. the two RPCs (below).

Migration is forward-only once used: the 'message' enum value can't be dropped; card_id SET NOT
NULL rollback fails once any null-card row exists. Apply consciously.

## THE TWO RPCs (SECURITY DEFINER, single canonical write path — NET-NEW)

respond_to_inbound(p_inbound_id uuid, p_decision text, p_body text default null) -> jsonb
- App-only path: actor = entity bound to auth.uid() (self-authorizing, no spoofing).
- Validates decision in ('accepted','passed'); recipient-ownership; status='pending' (idempotent).
- ACCEPT: set threads.established_at = coalesce(established_at, now()); KEEP THREAD OPEN
  (state='open'); if p_body non-empty -> insert message #1 (from_entity_id=actor, origin='human',
  inbound_id set).
- DECLINE: mark inbound passed; close thread ONLY when established_at IS NULL (critical guard —
  never close a live conversation when declining a later knock).
- Writes an audit_log imprint (accept='confirm', pass='suggest'). audit_log + audit_action EXIST
  (0000_card_model.sql:120, :37); audit_action = ('observe','suggest','confirm','execute') so
  'confirm'/'suggest' are valid — will NOT throw. Match the real audit_log NOT-NULL columns.

post_message(p_thread_id uuid, p_body text, p_from_entity_id uuid default null) -> jsonb
- Dual caller: app (auth.uid -> entity, origin='human', IGNORES passed entity = anti-spoof) OR
  service-role/network (uses p_from_entity_id, origin currently 'human'; V2 may pass 'ai').
- Validates body non-empty; sender is a thread participant; thread IS established (first contact
  MUST route through inbound — consent gate enforced in SQL).
- Inserts message; bumps threads.last_message_at.

grants: respond_to_inbound -> authenticated; post_message -> authenticated, service_role.

## MODEL B ROUTING (reach_entity, network TS — built AFTER migration)

    thread = locateOrCreateThread(from, to)   // now also reads established_at
    if thread.established_at != null:
        post_message(thread.id, message, actor=from)   // -> PlexChat, no Incoming tile
    else:
        insert inbound { to, from, card_id ?? null, thread.id, kind, message, status:'pending' }
    // card_id REQUIRED for reach/booking/order; OPTIONAL (null) for kind='message'

## FILE PLAN

16a — receive + consent spine (demoable end-to-end), NO native rebuild:
- network/SQL: the migration (Blocks A+B)  [apply by hand, human-runs-critical-ops]
- network/TS: reach_entity Model B routing + no-card 'message' path
- POS: inbound + message types; first realtime hook (useInbound); Incoming tab (realtime tiles +
  type-driven InboundTile + Accept/Decline via rpc('respond_to_inbound') + coral receipt);
  minimal PlexChat read view (realtime messages, opens on Accept); nav -> 4 tabs.

16b — full conversation + outbound reply + push (NEEDS native rebuild for push):
- POS: PlexChat send (compose + rpc('post_message'), optimistic); PlexChat thread list view
  (NEEDS a NEW threads SELECT RLS policy — deferred from 16a; add `using (is_thread_participant(id))`
  when the thread-list lands, since 16a grants no direct threads read);
  push notifications (expo-notifications -> prebuild/rebuild).
- network/TS: get_messages / post_message MCP tools (crude LLM pull-loop); respond_thread
  refactor -> call the shared RPCs.

## KNOWN DIVERGENCE TO RECONCILE LATER (not in 16a)

Legacy MCP respond_thread CLOSES the thread on accept and never writes a message; the new
respond_to_inbound KEEPS the thread open + persists message #1. 16b's respond_thread refactor
should reconcile them (or retire respond_thread). Flagged, not done.

## APPLY / BUILD SEQUENCE

1. Validate every type/table/column against the DEPLOYED schema first (inbound.status values,
   threads.state/participant_a/b/last_message_at, entities.user_id, audit_log NOT-NULL columns).
2. Apply Block A (standalone) -> commit. Apply Block B (begin/commit).
3. Verify tables/columns/RPCs/policies exist; realtime publication includes inbound+messages.
4. Build 16a per the file plan. tsc clean. Commit locally to main. DO NOT push.
5. Device-verify 16a (no rebuild): reach arrives -> Incoming tile (seconds) -> Accept -> thread
   opens + message #1 renders -> Decline -> nothing. Cross-LLM later.
6. 16b is a SEPARATE build (needs the native rebuild for push).
