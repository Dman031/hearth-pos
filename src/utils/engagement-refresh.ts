// engagement-refresh — in-app change signal for the engagements table.
//
// WHY THIS EXISTS: engagements was NOT in the supabase_realtime publication —
// 0004 added only inbound + messages, and neither 0017 nor 0018 added the
// table — so every postgres_changes channel on engagements was a dead
// subscription (BUG-009, 2026-07-27). In-app writes that change engagement
// state call notifyEngagementsChanged() so dependent surfaces (the Engagement
// tab badge) reload deterministically.
//
// WHY IT STAYS: hearth-network 0041 added the table to the publication and set
// replica identity full (applied 2026-08-26; confirmed against
// pg_publication_tables), so the channels are live and BUG-009 is closed. This
// signal is now redundant — and deliberately kept. Reloads are idempotent
// re-reads of RLS-scoped queries, so the redundancy costs nothing, and it is
// the deterministic path when a realtime connection drops. PLEXMED S7 spec
// (app-side gap 2) rules it stays in place; do not delete it.

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
