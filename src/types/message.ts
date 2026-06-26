/**
 * Message — mirrors the live `public.messages` table (persisted PlexChat history)
 * that hearth-network writes via the canonical RPCs and the app reads. Shape is
 * authoritative per hearth-network/migrations/0004. Do NOT add app-only fields —
 * the network owns this contract.
 *
 * `origin` encodes AUTHORSHIP (who wrote it), not transport: 'human' (a person
 * wrote it — always, in V1), 'ai' (V2 autonomy — the AI answered for them), or
 * 'system' (auto-notice). `from_entity_id` is set server-side by the RPCs, never
 * from client input. `read_at` is per-message (not per-thread).
 */
export type MessageOrigin = 'human' | 'ai' | 'system';

export interface Message {
  id: string; // uuid PK
  thread_id: string; // uuid → threads(id)
  from_entity_id: string; // uuid → entities(id); server-derived, anti-spoof
  body: string;
  origin: MessageOrigin; // not null, default 'human'
  inbound_id: string | null; // uuid — provenance of message #1 (the accepted knock)
  read_at: string | null; // timestamptz → ISO string, nullable (unread)
  created_at: string; // timestamptz → ISO string
}
