import { useCallback, useEffect, useState } from 'react';
import { fetchCardSlots, type CardSlot } from '../services/slots';

// useCardSlots — the open-times board's read, for ONE practice card.
//
// NO REALTIME, AND THAT IS DELIBERATE. public.card_slots is not in the
// supabase_realtime publication — 0004 added inbound and messages, 0041 added
// engagements, and nothing adds card_slots. Per BUG-009's prevention note, a
// postgres_changes channel on an unpublished table is a SILENT NO-OP: it
// subscribes successfully and never delivers, which is the most expensive
// failure class because it looks fine. So this hook does not write one.
//
// Instead: load on mount / on window change, and refetch after this screen's
// own writes. Held and booked states arrive from the server on those reads,
// which is exactly what S5 note 4 requires — the board never sets them.

export interface UseCardSlots {
  slots: CardSlot[];
  isLoading: boolean;
  /** True when the read failed. The board shows its own line; never a fake empty. */
  failed: boolean;
  refresh: () => Promise<void>;
}

export default function useCardSlots(
  cardId: string | null,
  from: Date,
  to: Date,
): UseCardSlots {
  const [slots, setSlots] = useState<CardSlot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);

  // Date objects are new on every render; key the effect on their instants so
  // it re-runs when the WINDOW moves, not when the parent happens to re-render.
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const load = useCallback(
    async (opts?: { signal?: AbortSignal; silent?: boolean }) => {
      if (!cardId) {
        setSlots([]);
        return;
      }
      if (!opts?.silent) setIsLoading(true);
      const result = await fetchCardSlots(cardId, new Date(fromMs), new Date(toMs));
      if (opts?.signal?.aborted) return;
      if (!result.ok) {
        // An empty board and a failed read must not look alike — the board
        // renders a distinct line for this rather than "no open times".
        setFailed(true);
        if (!opts?.silent) setIsLoading(false);
        return;
      }
      setFailed(false);
      setSlots(result.value);
      if (!opts?.silent) setIsLoading(false);
    },
    [cardId, fromMs, toMs],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(async () => {
    await load({ silent: true });
  }, [load]);

  return { slots, isLoading, failed, refresh };
}
