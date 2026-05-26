import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../services/supabase';
import { useAuthContext } from './AuthContext';
import type { VendorProfile } from '../types/vendor';

interface VendorContextValue {
  vendor: VendorProfile | null;
  isLoading: boolean;
  error: Error | null;
  createVendor: (partial: Partial<VendorProfile>) => Promise<VendorProfile>;
  refresh: () => Promise<void>;
}

const VendorContext = createContext<VendorContextValue | null>(null);

const REFERRAL_CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const REFERRAL_CODE_LENGTH = 6;
const MAX_REFERRAL_CODE_ATTEMPTS = 3;
const POSTGRES_UNIQUE_VIOLATION = '23505';

function generateReferralCode(): string {
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length);
    code += REFERRAL_CODE_ALPHABET[index];
  }
  return code;
}

function toError(value: unknown, context: string): Error {
  if (value instanceof Error) {
    return value;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  ) {
    return new Error(
      `[VendorProvider] ${context}: ${(value as { message: string }).message}`,
    );
  }
  return new Error(`[VendorProvider] ${context}`);
}

async function insertVendorWithUniqueReferralCode(
  userId: string,
  partial: Partial<VendorProfile>,
): Promise<VendorProfile> {
  for (let attempt = 1; attempt <= MAX_REFERRAL_CODE_ATTEMPTS; attempt += 1) {
    const row = {
      ...partial,
      user_id: userId,
      template_id: partial.template_id ?? null,
      referral_code: generateReferralCode(),
    };

    const { data, error: insertError } = await supabase
      .from('vendor_profiles')
      .insert(row)
      .select()
      .single();

    if (insertError) {
      if (insertError.code === POSTGRES_UNIQUE_VIOLATION) {
        console.warn(
          `[VendorProvider] referral_code collision on attempt ${attempt} of ` +
            `${MAX_REFERRAL_CODE_ATTEMPTS}; regenerating`,
        );
        continue;
      }
      throw toError(insertError, 'insert into vendor_profiles failed');
    }

    if (!data) {
      throw new Error(
        '[VendorProvider] insert succeeded but returned no row',
      );
    }

    return data as VendorProfile;
  }

  throw new Error(
    `[VendorProvider] could not generate a unique referral_code after ` +
      `${MAX_REFERRAL_CODE_ATTEMPTS} attempts`,
  );
}

interface VendorProviderProps {
  children: ReactNode;
}

// VendorProvider depends on AuthProvider — must be wrapped inside it in App.tsx.
export function VendorProvider({ children }: VendorProviderProps) {
  const { user, isLoading: authLoading } = useAuthContext();

  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const activeController = useRef<AbortController | null>(null);

  const loadVendor = useCallback(async (userId: string): Promise<void> => {
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('vendor_profiles')
        .select('*')
        .eq('user_id', userId)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (controller.signal.aborted) {
        return;
      }

      if (queryError) {
        console.error(
          '[VendorProvider] failed to load vendor profile:',
          queryError,
        );
        setError(toError(queryError, 'failed to load vendor profile'));
        setVendor(null);
        return;
      }

      setVendor(data as VendorProfile | null);
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      console.error(
        '[VendorProvider] unexpected error loading vendor profile:',
        err,
      );
      setError(toError(err, 'unexpected error loading vendor profile'));
      setVendor(null);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setVendor(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    void loadVendor(user.id);

    return () => {
      activeController.current?.abort();
    };
  }, [user, authLoading, loadVendor]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!user) {
      activeController.current?.abort();
      setVendor(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    await loadVendor(user.id);
  }, [user, loadVendor]);

  const createVendor = useCallback(
    async (partial: Partial<VendorProfile>): Promise<VendorProfile> => {
      if (!user) {
        const noUserError = new Error(
          '[VendorProvider] cannot create a vendor profile without an ' +
            'authenticated user',
        );
        console.error(noUserError.message);
        setError(noUserError);
        throw noUserError;
      }

      setError(null);

      try {
        const created = await insertVendorWithUniqueReferralCode(
          user.id,
          partial,
        );
        setVendor(created);
        return created;
      } catch (err) {
        const wrapped = toError(err, 'failed to create vendor profile');
        console.error('[VendorProvider] createVendor failed:', wrapped);
        setError(wrapped);
        throw wrapped;
      }
    },
    [user],
  );

  const value = useMemo<VendorContextValue>(
    () => ({ vendor, isLoading, error, createVendor, refresh }),
    [vendor, isLoading, error, createVendor, refresh],
  );

  return (
    <VendorContext.Provider value={value}>{children}</VendorContext.Provider>
  );
}

export function useVendorContext(): VendorContextValue {
  const ctx = useContext(VendorContext);
  if (ctx === null) {
    throw new Error(
      '[VendorContext] useVendor must be used inside <VendorProvider>',
    );
  }
  return ctx;
}
