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
import { useEntityContext } from './EntityContext';
import {
  assertCardCanGoLive,
  evaluateCardGate,
} from '../services/card-gating';
import {
  fieldsToPersist,
  normalizeFields,
  setAvailabilityAt,
} from '../utils/card-fields';
import type { Card, CardDraft } from '../types/card';

interface CardContextValue {
  cards: Card[];
  // True during ANY card load, including background refreshes. Do NOT gate a
  // full-screen splash on this — mirror the EntityContext split and use
  // `isInitializing` for the app-level first-load gate.
  isLoading: boolean;
  // True ONLY until the FIRST card load for the current entity resolves.
  // Background refreshes leave this false so Root can gate its splash on it
  // without tearing the navigator down on every refresh.
  isInitializing: boolean;
  error: Error | null;
  // Latched at the first card-load resolution: true when the entity has zero
  // cards (a fresh user who hasn't seeded any). Deliberately NOT recomputed when
  // createCard adds a card mid-flow — otherwise saving card #1 would yank the
  // user out of the onboarding helper before the "offer more / done" steps.
  // Cleared only by completeOnboarding(). Recomputed from the DB on next launch,
  // so the helper never runs again once cards exist.
  needsOnboarding: boolean;
  createCard: (draft: CardDraft) => Promise<Card>;
  // Canonical edit write (Profile editor). Patches title, fields, see/act
  // permissions, and/or kind on an existing card, then re-embeds fire-and-forget
  // via the same embed-card path createCard uses — so edits stay in
  // semantic-search sync. `verification_required` / `verification_status` are
  // NOT touched here: the editor never exposes the verification gate, and the
  // 'verified'-tier owner-verification lock is enforced UI-side at the editor /
  // add-card surfaces (see DEFERRED.md — onboarding-vs-editor enforcement seam),
  // not in this shared write path.
  updateCard: (
    id: string,
    patch: {
      title?: string;
      fields?: Card['fields'];
      see_perm?: Card['see_perm'];
      act_perm?: Card['act_perm'];
      kind?: Card['kind'];
    },
  ) => Promise<Card>;
  // Day 13 — flip ONE item field's `available` flag (the 86 toggle). `fieldIndex`
  // is the position in normalizeFields(card.fields) (canonical order, media entry
  // included), matching what ProfileCard renders from. Writes only the `fields`
  // jsonb and DELIBERATELY does NOT re-embed: availability is not searchable text
  // (see embed note below + DEFERRED). Optimistic; reverts on write failure.
  setFieldAvailability: (
    cardId: string,
    fieldIndex: number,
    available: boolean,
  ) => Promise<void>;
  completeOnboarding: () => void;
  refresh: () => Promise<void>;
}

const CardContext = createContext<CardContextValue | null>(null);

// Explicit column list = the Card contract. NEVER select('*') on cards: the
// table now carries an `embedding vector(768)` + `embedding_model` (semantic
// search) that the app must not pull — 768 floats per card would bloat every
// load to the mobile client. These columns mirror src/types/card.ts exactly.
const CARD_COLUMNS =
  'id, entity_id, title, kind, fields, see_perm, act_perm, ' +
  'verification_required, verification_status, commerce_enabled, ' +
  'display_order, created_at, updated_at';

// Fire-and-forget: embed a newly-created/edited card for semantic search via the
// embed-card edge function (which holds the Cloudflare key server-side). NEVER
// blocks or fails card creation — if embedding fails the card still exists and
// is found via the network's substring fallback; the backfill re-embeds later.
async function triggerEmbedCard(cardId: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('embed-card', {
      body: { card_id: cardId },
    });
    if (error) {
      console.warn('[CardProvider] embed-card invoke failed (non-fatal):', error);
    }
  } catch (err) {
    console.warn('[CardProvider] embed-card invoke threw (non-fatal):', err);
  }
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
      `[CardProvider] ${context}: ${(value as { message: string }).message}`,
    );
  }
  return new Error(`[CardProvider] ${context}`);
}

interface CardProviderProps {
  children: ReactNode;
}

// CardProvider depends on EntityProvider (reads entity.id) — keep it nested
// inside <EntityProvider> in App.tsx.
export function CardProvider({ children }: CardProviderProps) {
  const { entity } = useEntityContext();
  const entityId = entity?.id ?? null;

  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const activeController = useRef<AbortController | null>(null);
  // The entity id whose first load has resolved. Lets the load effect tell a
  // genuine entity switch (new id) apart from a re-render with the same id —
  // only the former re-shows the splash via setIsInitializing(true) and re-arms
  // the onboarding latch.
  const initializedEntityId = useRef<string | null>(null);

  const loadCards = useCallback(async (id: string): Promise<void> => {
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('cards')
        .select(CARD_COLUMNS)
        .eq('entity_id', id)
        .order('display_order', { ascending: true })
        .abortSignal(controller.signal);

      if (controller.signal.aborted) {
        return;
      }

      if (queryError) {
        console.error('[CardProvider] failed to load cards:', queryError);
        setError(toError(queryError, 'failed to load cards'));
        setCards([]);
        return;
      }

      // Cast through unknown: a dynamic select() column string makes supabase-js
      // infer GenericStringError[] rather than the row type.
      const loaded = (data as unknown as Card[] | null) ?? [];
      setCards(loaded);
      // Latch the onboarding decision exactly once per entity, at first-load
      // resolution. A returning user with cards skips the helper for good.
      if (initializedEntityId.current !== id) {
        setNeedsOnboarding(loaded.length === 0);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      console.error('[CardProvider] unexpected error loading cards:', err);
      setError(toError(err, 'unexpected error loading cards'));
      setCards([]);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
        setIsInitializing(false);
        initializedEntityId.current = id;
      }
    }
  }, []);

  useEffect(() => {
    if (!entityId) {
      // No entity yet (pre-setup) — nothing to load, and nothing to onboard.
      setCards([]);
      setError(null);
      setIsLoading(false);
      setIsInitializing(false);
      setNeedsOnboarding(false);
      initializedEntityId.current = null;
      return;
    }

    // Re-show the splash gate only for an entity whose first load hasn't
    // resolved (cold start / account switch / just-created entity).
    if (initializedEntityId.current !== entityId) {
      setIsInitializing(true);
    }

    void loadCards(entityId);

    return () => {
      activeController.current?.abort();
    };
  }, [entityId, loadCards]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!entityId) {
      activeController.current?.abort();
      setCards([]);
      setError(null);
      setIsLoading(false);
      setIsInitializing(false);
      setNeedsOnboarding(false);
      initializedEntityId.current = null;
      return;
    }
    await loadCards(entityId);
  }, [entityId, loadCards]);

  const createCard = useCallback(
    async (draft: CardDraft): Promise<Card> => {
      if (!entity) {
        const noEntityError = new Error(
          '[CardProvider] cannot create a card without an entity',
        );
        console.error(noEntityError.message);
        setError(noEntityError);
        throw noEntityError;
      }

      setError(null);

      // PROMPT-CODE CONTRACT: the gate is enforced in code at the write
      // boundary, not just in a prompt. Throws if a card that requires
      // verification is taken live before the entity is verified.
      assertCardCanGoLive(entity, draft);
      // The persisted verification_status is derived by the gate, never set by
      // the writer (see CardDraft).
      const { verificationStatus } = evaluateCardGate(entity, draft);

      const row = {
        entity_id: entity.id,
        title: draft.title,
        kind: draft.kind,
        fields: draft.fields ?? null,
        see_perm: draft.see_perm,
        act_perm: draft.act_perm,
        verification_required: draft.verification_required,
        verification_status: verificationStatus,
        commerce_enabled: draft.commerce_enabled ?? false,
        display_order: draft.display_order ?? cards.length,
      };

      try {
        const { data, error: insertError } = await supabase
          .from('cards')
          .insert(row)
          .select(CARD_COLUMNS)
          .single();

        if (insertError) {
          throw toError(insertError, 'insert into cards failed');
        }

        if (!data) {
          // Zero rows on insert+select is the RLS silent-block signature.
          throw new Error(
            '[CardProvider] insert returned no row (possible RLS block)',
          );
        }

        const created = data as unknown as Card;
        setCards((prev) => [...prev, created]);
        // Embed for semantic search out-of-band — never blocks the return.
        void triggerEmbedCard(created.id);
        return created;
      } catch (err) {
        const wrapped = toError(err, 'failed to create card');
        console.error('[CardProvider] createCard failed:', wrapped);
        setError(wrapped);
        throw wrapped;
      }
    },
    [entity, cards.length],
  );

  const updateCard = useCallback(
    async (
      id: string,
      patch: {
        title?: string;
        fields?: Card['fields'];
        see_perm?: Card['see_perm'];
        act_perm?: Card['act_perm'];
        kind?: Card['kind'];
      },
    ): Promise<Card> => {
      setError(null);

      // Only the fields the editor actually changes are sent.
      // verification_required / verification_status stay untouched — the editor
      // never edits the gate, and the 'verified'-tier owner-verification lock is
      // enforced at the editor surface, not here.
      const row: Record<string, unknown> = {};
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.fields !== undefined) row.fields = patch.fields;
      if (patch.see_perm !== undefined) row.see_perm = patch.see_perm;
      if (patch.act_perm !== undefined) row.act_perm = patch.act_perm;
      if (patch.kind !== undefined) row.kind = patch.kind;

      try {
        const { data, error: updateError } = await supabase
          .from('cards')
          .update(row)
          .eq('id', id)
          .select(CARD_COLUMNS)
          .single();

        if (updateError) {
          throw toError(updateError, 'update card failed');
        }
        if (!data) {
          // Zero rows on a PK match is the RLS/constraint silent-block signature.
          throw new Error(
            '[CardProvider] update returned no row (possible RLS block)',
          );
        }

        const updated = data as unknown as Card;
        setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
        // Re-embed out-of-band so the edited card gets a fresh vector — never
        // blocks the save (mirrors createCard).
        void triggerEmbedCard(id);
        return updated;
      } catch (err) {
        const wrapped = toError(err, 'failed to update card');
        console.error('[CardProvider] updateCard failed:', wrapped);
        setError(wrapped);
        throw wrapped;
      }
    },
    [],
  );

  const setFieldAvailability = useCallback(
    async (
      cardId: string,
      fieldIndex: number,
      available: boolean,
    ): Promise<void> => {
      setError(null);

      const card = cards.find((c) => c.id === cardId);
      if (!card) {
        console.warn('[CardProvider] setFieldAvailability: card not found', cardId);
        return;
      }

      // Recompute the canonical fields array and flip the one item field.
      // setAvailabilityAt is a no-op unless the target is already an item
      // (carries a boolean `available`), so a describing field can't be 86'd.
      const current = normalizeFields(card.fields);
      const target = current[fieldIndex];
      if (!target || typeof target.available !== 'boolean') {
        console.warn(
          '[CardProvider] setFieldAvailability: index is not an item field',
          { cardId, fieldIndex },
        );
        return;
      }
      if (target.available === available) {
        return; // already in the requested state
      }

      const nextFields = fieldsToPersist(
        setAvailabilityAt(current, fieldIndex, available),
      );

      // Optimistic: flip locally now (one-tap feel), revert if the write fails.
      const prevCards = cards;
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, fields: nextFields } : c)),
      );

      try {
        // Writes ONLY the fields jsonb. NO triggerEmbedCard — availability is a
        // reported status, not embedding text (the explicit Day 13 guardrail).
        // Explicit CARD_COLUMNS (no select('*')); .select() so a silent RLS
        // zero-row block surfaces as failure per the SUPABASE WRITE RULE.
        const { data, error: updateError } = await supabase
          .from('cards')
          .update({ fields: nextFields })
          .eq('id', cardId)
          .select(CARD_COLUMNS)
          .single();

        if (updateError) {
          throw toError(updateError, 'update field availability failed');
        }
        if (!data) {
          throw new Error(
            '[CardProvider] availability update returned no row (possible RLS block)',
          );
        }

        // Reconcile with the authoritative row (e.g. updated_at).
        const updated = data as unknown as Card;
        setCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
      } catch (err) {
        // Revert the optimistic flip and surface the error.
        setCards(prevCards);
        const wrapped = toError(err, 'failed to set field availability');
        console.error('[CardProvider] setFieldAvailability failed:', wrapped);
        setError(wrapped);
      }
    },
    [cards],
  );

  const completeOnboarding = useCallback(() => {
    setNeedsOnboarding(false);
  }, []);

  const value = useMemo<CardContextValue>(
    () => ({
      cards,
      isLoading,
      isInitializing,
      error,
      needsOnboarding,
      createCard,
      updateCard,
      setFieldAvailability,
      completeOnboarding,
      refresh,
    }),
    [
      cards,
      isLoading,
      isInitializing,
      error,
      needsOnboarding,
      createCard,
      updateCard,
      setFieldAvailability,
      completeOnboarding,
      refresh,
    ],
  );

  return (
    <CardContext.Provider value={value}>{children}</CardContext.Provider>
  );
}

export function useCardContext(): CardContextValue {
  const ctx = useContext(CardContext);
  if (ctx === null) {
    throw new Error('[CardContext] useCards must be used inside <CardProvider>');
  }
  return ctx;
}
