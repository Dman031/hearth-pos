import { useCallback, useEffect, useState } from 'react';
import { getMoneyBalance, type MoneyBalance, type BalanceFailure } from '../services/money';

// useMoneyBalance — the Money sheet's BALANCE source. Loads once on mount
// (the panel mounts when the sheet row is tapped — no navigation focus to
// key off, unlike useContacts) and exposes refresh. The failure reason is
// carried through untouched so the panel can tell "session expired" (sign
// in again) apart from "balance unavailable" (money error) — the Worker's
// 401 is an auth outcome, not a money outcome.

export interface UseMoneyBalance {
  balance: MoneyBalance | null;
  isLoading: boolean;
  failure: BalanceFailure | null;
  refresh: () => Promise<void>;
}

export default function useMoneyBalance(): UseMoneyBalance {
  const [balance, setBalance] = useState<MoneyBalance | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [failure, setFailure] = useState<BalanceFailure | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await getMoneyBalance();
    if (result.ok) {
      setBalance(result.balance);
      setFailure(null);
    } else {
      setFailure(result.reason);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { balance, isLoading, failure, refresh: load };
}
