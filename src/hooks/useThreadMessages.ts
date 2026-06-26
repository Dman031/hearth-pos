import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import type { Message } from '../types/message';

// Live message history for one PlexChat thread. Loads ascending (oldest first)
// and appends on realtime INSERT (messages are append-only in V1). RLS
// (messages_select_participant) scopes both the query and the stream to threads
// the caller participates in.

const MESSAGE_SELECT =
  'id, thread_id, from_entity_id, body, origin, inbound_id, read_at, created_at';

function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

export interface UseThreadMessages {
  messages: Message[];
  isLoading: boolean;
  error: Error | null;
}

export default function useThreadMessages(threadId: string | null): UseThreadMessages {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setIsLoading(true);

    void (async () => {
      const { data, error: qErr } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });
      if (controller.signal.aborted || !active) return;
      if (qErr) {
        setError(toError(qErr, 'load messages'));
        setIsLoading(false);
        return;
      }
      setError(null);
      setMessages((data ?? []) as Message[]);
      setIsLoading(false);
    })();

    const channel: RealtimeChannel = supabase
      .channel(`messages:${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const next = payload.new as Message;
          setMessages((prev) =>
            prev.some((m) => m.id === next.id) ? prev : [...prev, next],
          );
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(toError(status, 'messages realtime'));
        }
      });

    return () => {
      active = false;
      controller.abort();
      void supabase.removeChannel(channel);
    };
  }, [threadId]);

  return { messages, isLoading, error };
}
