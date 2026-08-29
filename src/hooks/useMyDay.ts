import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyDay, type DayVisit } from '../services/visits';
import useEntity from './useEntity';
import { toDateKey, wallClockToInstant, addDaysToKey } from '../datetime';

// useMyDay — Today's read.
//
// "TODAY" IS A CLIENT RENDERING (VL-4 / S7-2). get_my_day takes two UTC
// instants and has no "today" parameter, because the server does not hold the
// zone that decides where the day begins. This hook computes the window from
// entities.timezone.
//
// THE FALLBACK IS UTC, WITH AN EXPLICIT UTC LABEL — never a guessed local zone.
// That is the one place S7 names a fallback, and it is deliberately NOT
// datetime's America/Los_Angeles display default: a clinician who has not
// confirmed a zone should see a day they can recognise as unset, not one
// silently placed in California.
export const UNSET_ZONE = 'UTC';

export interface UseMyDay {
  visits: DayVisit[];
  isLoading: boolean;
  failed: boolean;
  /** The zone the window was computed in — the tile labels its times with it. */
  tz: string;
  /** True when no practice zone is stored and the day is being shown in UTC. */
  zoneUnset: boolean;
  refresh: () => Promise<void>;
}

export default function useMyDay(): UseMyDay {
  const { entity } = useEntity();
  const storedTz = entity?.timezone ?? null;
  const tz = storedTz ?? UNSET_ZONE;

  const [visits, setVisits] = useState<DayVisit[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);

  // The day's bounds as instants. Recomputed when the zone changes; the date
  // itself is captured at mount so the window does not slide under a rendered
  // list while someone is reading it.
  const { fromMs, toMs } = useMemo(() => {
    const key = toDateKey(new Date(), tz);
    return {
      fromMs: wallClockToInstant(key, 0, 0, tz).getTime(),
      toMs: wallClockToInstant(addDaysToKey(key, 1), 0, 0, tz).getTime(),
    };
  }, [tz]);

  const load = useCallback(
    async (opts?: { signal?: AbortSignal; silent?: boolean }) => {
      if (!entity) {
        setVisits([]);
        return;
      }
      if (!opts?.silent) setIsLoading(true);
      const result = await fetchMyDay(new Date(fromMs), new Date(toMs));
      if (opts?.signal?.aborted) return;
      if (!result.ok) {
        // An empty day and a failed read must not look alike.
        setFailed(true);
        if (!opts?.silent) setIsLoading(false);
        return;
      }
      setFailed(false);
      setVisits(result.value);
      if (!opts?.silent) setIsLoading(false);
    },
    [entity, fromMs, toMs],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(async () => {
    await load({ silent: true });
  }, [load]);

  return { visits, isLoading, failed, tz, zoneUnset: storedTz === null, refresh };
}
