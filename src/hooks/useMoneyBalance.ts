import { useCallback, useEffect, useState } from 'react';
import { getMoneyBalance, type MoneyBalance, type BalanceFailure } from '../services/money';

// useMoneyBalance — the Money sheet's BALANCE source. Loads once on mount
// (the panel mounts when the sheet row is tapped — no navigation focus to
// key off, unlike useContacts) and exposes refresh. The failure reason is
// carried through untouched so the panel can tell "session expired" (sign
// in again) apart from "balance unavailable" (money error) — the Worker's
// 401 is an auth outcome, not a money outcome.
//
// refresh() RETURNS the fresh balance (not just void) so callers can act on
// it in-handler — the connect button uses this to skip launching onboarding
// when the webhook verified us since the panel loaded (the card editor's
// refresh-first habit, CardEditorSheet.tsx:213-216).

export interface UseMoneyBalance {
  balance: MoneyBalance | null;
  isLoading: boolean;
  failure: BalanceFailure | null;
  refresh: () => Promise<MoneyBalance | null>;
}

export default function useMoneyBalance(): UseMoneyBalance {
  const [balance, setBalance] = useState<MoneyBalance | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [failure, setFailure] = useState<BalanceFailure | null>(null);

  const load = useCallback(async (): Promise<MoneyBalance | null> => {
    setIsLoading(true);
    const result = await getMoneyBalance();
    let fresh: MoneyBalance | null = null;
    if (result.ok) {
      fresh = result.balance;
      setBalance(result.balance);
      setFailure(null);
    } else {
      setFailure(result.reason);
    }
    setIsLoading(false);
    return fresh;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { balance, isLoading, failure, refresh: load };
}
