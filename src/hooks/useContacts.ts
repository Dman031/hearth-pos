import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../services/supabase';
import useEntity from './useEntity';
import type { Contact } from '../types/contact';

// useContacts — the Contacts tab's private-rolodex source (Day 17A). The owner's
// saved contacts via the get_my_contacts() SECURITY DEFINER RPC (0012), which
// returns ONLY the peer's PUBLIC fields (display_name/deus_id/entity_type + the
// three verified flags) and is scoped server-side to current_entity_id(). Same
// definer-read pattern as useThreads/useThreadPeer over get_my_thread_peers (0007).
//
// Fetch-on-FOCUS (not realtime): contacts is not in the realtime publication, and
// a new contact is added from the Incoming tab — so the list refreshes when the
// Contacts tab regains focus (returning after an "Add to contacts" tap shows it).
//
// Read-only for the caller; RLS + the definer scope the rows to my own contacts.
// Saving a contact grants NO reach — this is a private list only (17B separate).

/** Unwrap an unknown thrown/returned value into a context-prefixed Error. */
function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

export interface UseContacts {
  contacts: Contact[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export default function useContacts(): UseContacts {
  const { entity } = useEntity();
  const entityId = entity?.id ?? null;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
      if (!entityId) {
        setContacts([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const { data, error: qErr } = await supabase.rpc('get_my_contacts');
      if (opts?.signal?.aborted) return;
      if (qErr) {
        setError(toError(qErr, 'load contacts'));
        setIsLoading(false);
        return;
      }
      setError(null);
      setContacts((data ?? []) as Contact[]);
      setIsLoading(false);
    },
    [entityId],
  );

  // Refresh whenever the tab regains focus; abort the in-flight load on blur.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      void load({ signal: controller.signal });
      return () => controller.abort();
    }, [load]),
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  return { contacts, isLoading, error, refresh };
}
