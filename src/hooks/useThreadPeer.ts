import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { peerLabel } from './useThreads';

// useThreadPeer — resolves the OTHER participant's public display label for one
// thread, for the conversation header title. Uses the same get_my_thread_peers()
// definer fn as the list (0007; public fields only). Covers BOTH entry paths into
// a conversation — list tap and Incoming Accept — so the header always names who.
// Returns null until resolved (the screen falls back to a passed title / generic).

interface PeerRow {
  thread_id: string;
  display_name: string | null;
  deus_id: string | null;
}

export default function useThreadPeer(threadId: string | null): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId) {
      setName(null);
      return;
    }
    let active = true;
    void (async () => {
      const { data, error } = await supabase.rpc('get_my_thread_peers');
      if (!active) return;
      if (error) {
        // Non-fatal: the header falls back to the passed/generic title.
        console.warn('[useThreadPeer] get_my_thread_peers failed', {
          threadId,
          error: error.message,
        });
        return;
      }
      const match = ((data ?? []) as PeerRow[]).find((p) => p.thread_id === threadId);
      if (match) setName(peerLabel(match));
    })();
    return () => {
      active = false;
    };
  }, [threadId]);

  return name;
}
