/**
 * Engagement — mirrors the live `public.engagements` table (the commitment
 * record minted inside respond_to_inbound's accept branch for booking/order
 * knocks). Shape is authoritative per hearth-network/migrations/0017. Do NOT
 * add app-only fields — the network owns this contract. Widened by 0041 (the
 * visit columns: visit_started_at + the three room columns).
 *
 * VOCABULARY BOUNDARY (Day 21 STOP-0, locked): "engagement" is internal —
 * schema, hooks, and this file only. User-visible strings use the kind noun
 * and the plain status words in STATUS_LABEL (src/utils/format.ts).
 */
import type { InboundKind } from './inbound';

export type EngagementStatus = 'accepted' | 'paid' | 'fulfilled' | 'cancelled';

export interface Engagement {
  id: string; // uuid PK
  inbound_id: string | null; // uuid UNIQUE — 1:1 with the accepted knock; SET NULL on delete
  kind: InboundKind; // booking | order today (a scheduled reach promotes later)
  buyer_entity_id: string | null; // snapshot posture: all FKs ON DELETE SET NULL
  seller_entity_id: string | null;
  card_id: string | null;
  thread_id: string | null;
  agreed_price_cents: number | null; // price snapshot AT ACCEPT — null = unpriced, never a placeholder
  currency: string; // not null, default 'usd'
  status: EngagementStatus;
  scheduled_for: string | null; // timestamptz → ISO string; an ATTRIBUTE, never a state
  // The visit columns (0041). The tile state is DERIVED from these, never read
  // from a status column (ruling S7-8): cancelled_at → Cancelled, fulfilled_at
  // → Wrapped, visit_started_at → In the visit, otherwise Scheduled.
  visit_started_at: string | null; // set by start_visit (seller-only, idempotent)
  room_url: string | null; // null = no room yet — equally true pre-T-60 and unprovisioned
  room_provider: string | null;
  room_created_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}
