import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { peerLabel } from './useThreads';

// useThreadPeer — resolves the OTHER participant's public display label AND entity
// id for one thread. The label names the conversation header; the entity id backs
// the header's "Add to contacts" action (add_contact, 0012). Uses the same
// get_my_thread_peers() definer fn as the list (0007; public fields only). Covers
// BOTH entry paths into a conversation — list tap and Incoming Accept. Both fields
// are null until resolved (the screen falls back to a passed title / generic).

interface PeerRow {
  thread_id: string;
  peer_entity_id: string;
  display_name: string | null;
  deus_id: string | null;
}

export interface ThreadPeer {
  name: string | null;
  entityId: string | null;
}

export default function useThreadPeer(threadId: string | null): ThreadPeer {
  const [peer, setPeer] = useState<ThreadPeer>({ name: null, entityId: null });

  useEffect(() => {
    if (!threadId) {
      setPeer({ name: null, entityId: null });
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
      if (match) setPeer({ name: peerLabel(match), entityId: match.peer_entity_id ?? null });
    })();
    return () => {
      active = false;
    };
  }, [threadId]);

  return peer;
}
