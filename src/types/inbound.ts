/**
 * Inbound — mirrors the live `public.inbound` table (the receive-side routing
 * record) that hearth-network writes and the Incoming tab reads. Shape is
 * authoritative per hearth-network/migrations/0001 + 0004, widened by 0020
 * (scheduled_for), 0028 (quantity) and 0037a/0037b (the 'notice' kind and the
 * nullable sender). Do NOT add app-only fields — the network owns this
 * contract.
 *
 * One row per reach/booking/order/message/notice routed at a target entity.
 * `card_id` is nullable since 16a (a plain `message` carries no card).
 * `status` transitions pending -> accepted | passed via the respond_to_inbound
 * RPC.
 */

/**
 * 'notice' (0037a) is the network speaking for itself — a stamp coming off,
 * not a person knocking. It is the ONLY kind that may carry a null sender
 * (constraint inbound_null_sender_is_notice, 0037b) and it arrives with no
 * thread, so it has no accept path.
 */
export type InboundKind = 'reach' | 'booking' | 'order' | 'message' | 'notice';
export type InboundStatus = 'pending' | 'accepted' | 'passed';

export interface Inbound {
  id: string; // uuid PK
  to_entity_id: string; // uuid — recipient (the current vendor in the Incoming tab)
  // uuid — sender; set server-side, never client-supplied. NULL only for a
  // network notice (0037b:75 dropped NOT NULL; a notice is not from a person).
  from_entity_id: string | null;
  card_id: string | null; // uuid, nullable since 16a (null for kind 'message')
  thread_id: string | null; // uuid — correlation thread; always set by reach_entity
  kind: InboundKind;
  message: string;
  status: InboundStatus;
  return_address: Record<string, unknown>; // jsonb — how a reply routes back
  // The instant the sender asked for, when the knock names one (0020). A UTC
  // instant — every render carries an explicit zone (VL-4).
  scheduled_for: string | null; // timestamptz → ISO string
  quantity: number | null; // how many, on an order that names a count (0028)
  created_at: string; // timestamptz → ISO string
}
