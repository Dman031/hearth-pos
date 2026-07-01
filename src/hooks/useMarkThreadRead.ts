import { useCallback } from 'react';
import { supabase } from '../services/supabase';

// useMarkThreadRead — the app's ONLY write path to messages.read_at. Wraps the
// canonical SECURITY DEFINER RPC public.mark_thread_read (0008), mirroring
// usePostMessage: the actor is derived SERVER-SIDE via current_entity_id() and
// the write is participant-gated + scoped to still-unread messages the caller
// RECEIVED (own sends are never stamped). There is no client-side update on
// `messages` (RLS permits none) — this RPC is the single read_at writer.
//
// Idempotent: a repeat call marks 0 rows. marked === 0 is a legitimate no-op
// (already read), NOT a failure — only the RPC `error` is a failure.

export interface MarkThreadReadResult {
  threadId: string;
  marked: number;
}

export default function useMarkThreadRead() {
  const markThreadRead = useCallback(
    async (threadId: string): Promise<MarkThreadReadResult> => {
      const { data, error } = await supabase.rpc('mark_thread_read', {
        p_thread_id: threadId,
      });
      if (error) {
        console.warn('[useMarkThreadRead] mark_thread_read RPC failed', {
          threadId,
          error: error.message,
        });
        throw new Error(error.message);
      }
      const marked =
        data && typeof data === 'object'
          ? ((data as { marked?: number }).marked ?? 0)
          : 0;
      return { threadId, marked };
    },
    [],
  );

  return { markThreadRead };
}
