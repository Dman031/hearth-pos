import { useCallback } from 'react';
import { supabase } from '../services/supabase';

// usePostMessage — the app's ONLY send path into an established PlexChat thread.
// Wraps the canonical SECURITY DEFINER RPC public.post_message (Seam C). The
// sender is derived SERVER-SIDE from auth.uid() (anti-spoof); we pass ONLY
// p_thread_id + p_body and NEVER p_from_entity_id (it is ignored on the app
// path). There is no client-side insert into `messages` (RLS permits none) —
// this RPC is the single write path for outbound messages.

export interface PostMessageResult {
  messageId: string;
  threadId: string;
}

export default function usePostMessage() {
  const postMessage = useCallback(
    async (threadId: string, body: string): Promise<PostMessageResult> => {
      const { data, error } = await supabase.rpc('post_message', {
        p_thread_id: threadId,
        p_body: body,
        // p_from_entity_id intentionally omitted — server derives the sender.
      });
      if (error) {
        console.warn('[usePostMessage] post_message RPC failed', {
          threadId,
          error: error.message,
        });
        throw new Error(error.message);
      }
      const messageId =
        data && typeof data === 'object'
          ? ((data as { message_id?: string }).message_id ?? null)
          : null;
      if (!messageId) {
        // A success with no message_id is a contract violation — treat as failure,
        // never a silent no-op (CLAUDE.md SUPABASE WRITE RULE).
        console.warn('[usePostMessage] post_message returned no message_id', { threadId });
        throw new Error('post_message returned no message_id');
      }
      return { messageId, threadId };
    },
    [],
  );

  return { postMessage };
}
