// engagement-refresh — in-app change signal for the engagements table.
//
// WHY THIS EXISTS: engagements is NOT in the supabase_realtime publication —
// 0004 added only inbound + messages, and neither 0017 nor 0018 adds the
// table — so every postgres_changes channel on engagements is a dead
// subscription today (BUG-009). Until the publication gains the table (a
// hearth-network SQL one-liner, outside this repo's scope), in-app writes
// that change engagement state call notifyEngagementsChanged() so dependent
// surfaces (the Engagement tab badge) reload deterministically. Harmless once
// realtime is live: reloads are idempotent re-reads of RLS-scoped queries.

type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe to in-app engagement changes; returns the unsubscribe fn. */
export function onEngagementsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Fire after any in-app write that transitions an engagement row. */
export function notifyEngagementsChanged(): void {
  for (const listener of listeners) listener();
}
