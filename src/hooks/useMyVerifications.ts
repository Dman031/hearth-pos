import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMyVerifications } from '../services/credentials';
import useEntity from './useEntity';
import type { Verification } from '../types/verification';

// useMyVerifications — the owner's credential receipts, via the
// get_my_verifications() SECURITY DEFINER RPC (hearth-network 0035). Same
// definer-read pattern as useContacts over get_my_contacts (0012) and
// useSettledPayments over get_my_settled_payments (0027); scoping is
// current_entity_id() server-side.
//
// FETCH-ON-FOCUS + POLL-WHILE-PENDING. Realtime is NOT available here and
// never will be: public.verifications has RLS enabled with no select policy,
// so the table is not client-readable and a realtime subscription cannot
// observe it. The RPC is the only window.
//
// The ceremony is asynchronous to the request — a scheduled drain works the
// 'pending' rows about once a minute (ruling F1) — so the hook re-reads while
// any row is still pending and stops as soon as none is. The tick is a
// recursive setTimeout, not setInterval: an interval would stack a second
// request on top of a slow one. Both the timer and the in-flight read are
// cancelled on blur.
//
// Read-only for the caller. Nothing here can change a status: the app has no
// write path to verifications (R4, no override path), and the verdict column
// entities.credential_verified is projected by record_verification_outcome.
//
// Status values are RAW. Vendor-facing copy for each state is ruled
// separately (S3-2) and belongs in the screens, not here.

/** How often to re-read while a ceremony is in flight. The drain runs ~60s. */
const POLL_INTERVAL_MS = 20_000;

export interface UseMyVerifications {
  verifications: Verification[];
  isLoading: boolean;
  error: Error | null;
  /** True while any row is still 'pending' — i.e. the hook is polling. */
  isPending: boolean;
  refresh: () => Promise<void>;
}

/** A ceremony is in flight iff at least one row is still pending. */
function hasPending(rows: Verification[]): boolean {
  return rows.some((r) => r.status === 'pending');
}

export default function useMyVerifications(): UseMyVerifications {
  const { entity } = useEntity();
  const entityId = entity?.id ?? null;
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const load = useCallback(
    async (opts?: { signal?: AbortSignal }): Promise<Verification[] | null> => {
      if (!entityId) {
        setVerifications([]);
        setIsLoading(false);
        return null;
      }
      const result = await fetchMyVerifications();
      if (opts?.signal?.aborted) return null;
      if (!result.ok) {
        console.warn('[verifications] load failed:', result.error);
        setError(result.error);
        setIsLoading(false);
        return null;
      }
      setError(null);
      setVerifications(result.verifications);
      setIsLoading(false);
      return result.verifications;
    },
    [entityId],
  );

  // The polling pump: read once, and re-arm ONLY while something is pending.
  // A named function expression so it can schedule itself without a ref
  // dance. An errored load returns null and stops the chain — refresh() or
  // the next focus restarts it, so a flapping network cannot spin a timer.
  const pump = useCallback(
    async function pumpOnce(): Promise<void> {
      clearTimer();
      const signal = controllerRef.current?.signal;
      const rows = await load({ signal });
      if (signal?.aborted) return;
      if (rows && hasPending(rows)) {
        timerRef.current = setTimeout(() => {
          void pumpOnce();
        }, POLL_INTERVAL_MS);
      }
    },
    [load, clearTimer],
  );

  // Read on focus; abort the in-flight read and drop the timer on blur.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsLoading(true);
      void pump();

      return () => {
        controller.abort();
        clearTimer();
      };
    }, [pump, clearTimer]),
  );

  // Belt-and-braces: never leave a timer behind if the owner unmounts the
  // screen without a blur (RN back-navigation is aggressive).
  useEffect(() => clearTimer, [clearTimer]);

  // Restarts the pump, not just a single read — an error stops the chain and
  // this is how it resumes.
  const refresh = useCallback(async () => {
    setIsLoading(true);
    await pump();
  }, [pump]);

  return {
    verifications,
    isLoading,
    error,
    isPending: hasPending(verifications),
    refresh,
  };
}
