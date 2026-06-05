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
import { mintDeusId } from '../services/deus-id';
import type { CreateEntityInput, Entity } from '../types/entity';

interface EntityContextValue {
  entity: Entity | null;
  isLoading: boolean;
  error: Error | null;
  // Set by createEntity, held until acknowledgeReveal(). Drives the one-time
  // "this is you — <deus_id>" reveal without persisting routing state, and is
  // never set for a loaded (pre-existing) entity — so returning logins skip it.
  revealEntity: Entity | null;
  createEntity: (input: CreateEntityInput) => Promise<Entity>;
  updateEntity: (patch: Partial<Entity>) => Promise<Entity>;
  acknowledgeReveal: () => void;
  refresh: () => Promise<void>;
}

const EntityContext = createContext<EntityContextValue | null>(null);

const POSTGRES_UNIQUE_VIOLATION = '23505';
const MAX_DEUS_ID_ATTEMPTS = 5;

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
      `[EntityProvider] ${context}: ${(value as { message: string }).message}`,
    );
  }
  return new Error(`[EntityProvider] ${context}`);
}

/** Concatenated message + details, used to tell which unique index collided. */
function constraintText(err: unknown): string {
  const e = err as { message?: unknown; details?: unknown } | null;
  const message = e && typeof e.message === 'string' ? e.message : '';
  const details = e && typeof e.details === 'string' ? e.details : '';
  return `${message} ${details}`;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === POSTGRES_UNIQUE_VIOLATION;
}

/**
 * Inserts one entity for `userId`, retrying ONLY on a deus_id unique collision
 * (a fresh address is minted each attempt). A user_id collision means this
 * account already has an entity — surfaced as a distinct error rather than
 * burning retries. Zero rows on insert+select is the RLS silent-block signature
 * and is treated as failure.
 */
async function insertEntityWithUniqueDeusId(
  userId: string,
  input: CreateEntityInput,
): Promise<Entity> {
  for (let attempt = 1; attempt <= MAX_DEUS_ID_ATTEMPTS; attempt += 1) {
    const row = {
      user_id: userId,
      display_name: input.display_name,
      email: input.email,
      phone: input.phone,
      deus_id: mintDeusId(),
      // entity_type, verification flags, and status are omitted so the live
      // column defaults apply ('person' / false / 'active').
      // TODO(SMS): phone is stored UNVERIFIED. Once Supabase phone OTP is wired,
      // confirmation is auth-native (auth.users.phone_confirmed_at, Decision 1A)
      // — no phone-verified column is added to entities.
    };

    const { data, error: insertError } = await supabase
      .from('entities')
      .insert(row)
      .select()
      .single();

    if (insertError) {
      if (isUniqueViolation(insertError) && /deus_id/i.test(constraintText(insertError))) {
        console.warn(
          `[EntityProvider] deus_id collision on attempt ${attempt} of ` +
            `${MAX_DEUS_ID_ATTEMPTS}; regenerating`,
        );
        continue;
      }
      if (isUniqueViolation(insertError) && /user_id/i.test(constraintText(insertError))) {
        throw new Error(
          '[EntityProvider] an entity already exists for this account',
        );
      }
      throw toError(insertError, 'insert into entities failed');
    }

    if (!data) {
      throw new Error(
        '[EntityProvider] insert returned no row (possible RLS block)',
      );
    }

    return data as Entity;
  }

  throw new Error(
    `[EntityProvider] could not mint a unique deus_id after ` +
      `${MAX_DEUS_ID_ATTEMPTS} attempts`,
  );
}

interface EntityProviderProps {
  children: ReactNode;
}

// EntityProvider depends on AuthProvider — must be wrapped inside it in App.tsx.
export function EntityProvider({ children }: EntityProviderProps) {
  const { user, isLoading: authLoading } = useAuthContext();

  const [entity, setEntity] = useState<Entity | null>(null);
  const [revealEntity, setRevealEntity] = useState<Entity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const activeController = useRef<AbortController | null>(null);

  const loadEntity = useCallback(async (userId: string): Promise<void> => {
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;

    setIsLoading(true);
    setError(null);
    // A loaded entity is pre-existing — never trigger the deus_id reveal for it.
    setRevealEntity(null);

    try {
      const { data, error: queryError } = await supabase
        .from('entities')
        .select('*')
        .eq('user_id', userId)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (controller.signal.aborted) {
        return;
      }

      if (queryError) {
        console.error('[EntityProvider] failed to load entity:', queryError);
        setError(toError(queryError, 'failed to load entity'));
        setEntity(null);
        return;
      }

      setEntity(data as Entity | null);
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      console.error('[EntityProvider] unexpected error loading entity:', err);
      setError(toError(err, 'unexpected error loading entity'));
      setEntity(null);
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
      setEntity(null);
      setRevealEntity(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    void loadEntity(user.id);

    return () => {
      activeController.current?.abort();
    };
  }, [user, authLoading, loadEntity]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!user) {
      activeController.current?.abort();
      setEntity(null);
      setRevealEntity(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    await loadEntity(user.id);
  }, [user, loadEntity]);

  const createEntity = useCallback(
    async (input: CreateEntityInput): Promise<Entity> => {
      if (!user) {
        const noUserError = new Error(
          '[EntityProvider] cannot create an entity without an authenticated user',
        );
        console.error(noUserError.message);
        setError(noUserError);
        throw noUserError;
      }

      setError(null);

      try {
        const created = await insertEntityWithUniqueDeusId(user.id, input);
        setEntity(created);
        setRevealEntity(created);
        return created;
      } catch (err) {
        const wrapped = toError(err, 'failed to create entity');
        console.error('[EntityProvider] createEntity failed:', wrapped);
        setError(wrapped);
        throw wrapped;
      }
    },
    [user],
  );

  const updateEntity = useCallback(
    async (patch: Partial<Entity>): Promise<Entity> => {
      if (!user) {
        const noUserError = new Error(
          '[EntityProvider] cannot update an entity without an authenticated user',
        );
        console.error(noUserError.message);
        setError(noUserError);
        throw noUserError;
      }

      setError(null);

      const { data, error: updateError } = await supabase
        .from('entities')
        .update(patch)
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateError) {
        const wrapped = toError(updateError, 'failed to update entity');
        console.error('[EntityProvider] updateEntity failed:', wrapped);
        setError(wrapped);
        throw wrapped;
      }

      if (!data) {
        // Zero rows affected on a user_id match is the RLS silent-block signature.
        const noRowError = new Error(
          '[EntityProvider] update affected no rows (possible RLS block)',
        );
        console.error(noRowError.message);
        setError(noRowError);
        throw noRowError;
      }

      const updated = data as Entity;
      setEntity(updated);
      return updated;
    },
    [user],
  );

  const acknowledgeReveal = useCallback(() => {
    setRevealEntity(null);
  }, []);

  const value = useMemo<EntityContextValue>(
    () => ({
      entity,
      isLoading,
      error,
      revealEntity,
      createEntity,
      updateEntity,
      acknowledgeReveal,
      refresh,
    }),
    [
      entity,
      isLoading,
      error,
      revealEntity,
      createEntity,
      updateEntity,
      acknowledgeReveal,
      refresh,
    ],
  );

  return (
    <EntityContext.Provider value={value}>{children}</EntityContext.Provider>
  );
}

export function useEntityContext(): EntityContextValue {
  const ctx = useContext(EntityContext);
  if (ctx === null) {
    throw new Error(
      '[EntityContext] useEntity must be used inside <EntityProvider>',
    );
  }
  return ctx;
}
