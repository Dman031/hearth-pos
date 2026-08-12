/**
 * SettledPayment — one row of get_my_settled_payments() (hearth-network
 * migration 0027). Shape is authoritative per that migration. Do NOT add
 * app-only fields — derive display state in hooks/components.
 *
 * The helper is participant-scoped server-side (current_entity_id()) and
 * returns statuses where money actually moved: 'succeeded' | 'refunded' |
 * 'requires_capture'. It deliberately excludes idempotency keys and every
 * Stripe id — they never reach the app.
 *
 * kind/scheduled_for ride from the engagement's inbound; both are null for
 * pre-engagement historical rows. peer_* are null when the peer entity was
 * deleted. Render "unknown" states — never fabricate.
 */
export interface SettledPayment {
  transaction_id: string;
  engagement_id: string | null;
  peer_display_name: string | null;
  peer_deus_id: string | null;
  kind: string | null;
  created_at: string;
  amount_cents: number;
  fee_cents: number;
  currency: string;
  status: string;
  scheduled_for: string | null;
}
