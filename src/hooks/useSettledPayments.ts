import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import type { SettledPayment } from '../types/settled-payment';

// useSettledPayments — the Money sheet's SETTLED source: the
// get_my_settled_payments() SECURITY DEFINER RPC (hearth-network 0027),
// called directly with the app's own session — deliberately NOT a Worker
// endpoint (CLAUDE.md "Token planes": "A Worker settled proxy would be a
// second read path beside 0027 and is forbidden"). Same definer-read
// pattern as useContacts over get_my_contacts (0012); scoping is
// current_entity_id() server-side.
//
// Paging: newest-first, PAGE_SIZE per call, p_before cursor = the last
// row's created_at. hasMore is inferred from a full page.
//
// THE REFUND GAP: when a refund succeeds, the app writes nothing — the
// ledger row flips to 'refunded' only when the payment webhook lands. Until
// then the RPC still reports 'succeeded'. markRefunded() records the
// transaction id locally and the hook overlays status 'refunded' on every
// subsequent render/refresh, so a refresh inside the gap cannot bounce the
// row back to paid. The overlay is session-local; once the webhook lands
// the server agrees and the overlay is a no-op.

const PAGE_SIZE = 50;

export interface UseSettledPayments {
  payments: SettledPayment[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** Overlay a locally-known refund (post-refund, pre-webhook). */
  markRefunded: (transactionId: string) => void;
}

function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return new Error(`${context}: ${value.message}`);
  if (value && typeof value === 'object' && 'message' in value) {
    return new Error(`${context}: ${String((value as { message: unknown }).message)}`);
  }
  return new Error(`${context}: ${String(value)}`);
}

export default function useSettledPayments(): UseSettledPayments {
  const [payments, setPayments] = useState<SettledPayment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const refundedLocally = useRef<Set<string>>(new Set());

  const overlay = useCallback((rows: SettledPayment[]): SettledPayment[] => {
    if (refundedLocally.current.size === 0) return rows;
    return rows.map((r) =>
      refundedLocally.current.has(r.transaction_id) && r.status !== 'refunded'
        ? { ...r, status: 'refunded' }
        : r,
    );
  }, []);

  const fetchPage = useCallback(
    async (before: string | null): Promise<SettledPayment[] | null> => {
      const { data, error: qErr } = await supabase.rpc('get_my_settled_payments', {
        p_limit: PAGE_SIZE,
        p_before: before,
      });
      if (qErr) {
        setError(toError(qErr, 'load settled payments'));
        return null;
      }
      setError(null);
      return (data ?? []) as SettledPayment[];
    },
    [],
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const rows = await fetchPage(null);
    if (rows) {
      setPayments(overlay(rows));
      setHasMore(rows.length === PAGE_SIZE);
    }
    setIsLoading(false);
  }, [fetchPage, overlay]);

  const loadMore = useCallback(async () => {
    if (payments.length === 0) return;
    const cursor = payments[payments.length - 1].created_at;
    const rows = await fetchPage(cursor);
    if (rows) {
      setPayments((prev) => [...prev, ...overlay(rows)]);
      setHasMore(rows.length === PAGE_SIZE);
    }
  }, [payments, fetchPage, overlay]);

  const markRefunded = useCallback((transactionId: string) => {
    refundedLocally.current.add(transactionId);
    setPayments((prev) =>
      prev.map((r) =>
        r.transaction_id === transactionId && r.status !== 'refunded'
          ? { ...r, status: 'refunded' }
          : r,
      ),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { payments, isLoading, error, hasMore, refresh, loadMore, markRefunded };
}
