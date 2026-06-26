/**
 * Inbound — mirrors the live `public.inbound` table (the receive-side routing
 * record) that hearth-network writes and the Incoming tab reads. Shape is
 * authoritative per hearth-network/migrations/0001 + 0004. Do NOT add app-only
 * fields — the network owns this contract.
 *
 * One row per reach/booking/order/message routed at a target entity. `card_id`
 * is nullable since 16a (a plain `message` carries no card). `status`
 * transitions pending -> accepted | passed via the respond_to_inbound RPC.
 */
export type InboundKind = 'reach' | 'booking' | 'order' | 'message';
export type InboundStatus = 'pending' | 'accepted' | 'passed';

export interface Inbound {
  id: string; // uuid PK
  to_entity_id: string; // uuid — recipient (the current vendor in the Incoming tab)
  from_entity_id: string; // uuid — sender; set server-side, never client-supplied
  card_id: string | null; // uuid, nullable since 16a (null for kind 'message')
  thread_id: string | null; // uuid — correlation thread; always set by reach_entity
  kind: InboundKind;
  message: string;
  status: InboundStatus;
  return_address: Record<string, unknown>; // jsonb — how a reply routes back
  created_at: string; // timestamptz → ISO string
}
