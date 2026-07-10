/**
 * Card — mirrors the live `public.cards` table (Deus card model) that
 * hearth-network reads. Shape is authoritative per
 * hearth-network/migrations/0000_card_model.sql. Do NOT add app-only fields
 * here that do not exist on the table — the network reads this contract.
 *
 * A card belongs to one entity. Two permission axes (see / act) control who can
 * observe and who can act on the card. `verification_required` names the gate a
 * card's higher permissions sit behind; the entity's matching verified flag
 * (see src/services/card-gating.ts) is what satisfies it.
 */

export type CardKind =
  | 'capability'
  | 'state'
  | 'content'
  | 'event'
  | 'presence'
  | 'reachability';

/** Who may SEE the card. Ascending exposure: off < contacts < verified < anyone. */
export type SeePerm = 'off' | 'contacts' | 'verified' | 'anyone';

/** Who may ACT on the card. Ascending: off < contacts < verified. */
export type ActPerm = 'off' | 'contacts' | 'verified';

/** The verification a card's higher permissions require before going live. */
export type VerificationRequired = 'none' | 'id' | 'license' | 'business';

/** The card's own verification state. */
export type VerificationStatus = 'pending' | 'verified' | 'failed';

export interface Card {
  id: string; // uuid PK
  entity_id: string; // uuid, FK entities(id)
  title: string;
  kind: CardKind; // not null, default 'capability'
  fields: unknown | null; // jsonb
  see_perm: SeePerm; // not null, default 'anyone'
  act_perm: ActPerm; // not null, default 'off'
  verification_required: VerificationRequired; // not null, default 'none'
  verification_status: VerificationStatus; // not null, default 'pending'
  commerce_enabled: boolean; // not null, default false
  price_cents: number | null; // null = not priced (0014; never a placeholder)
  price_currency: string; // not null, default 'usd' (0014)
  commerce_terms: string | null; // free text (0014)
  display_order: number; // not null, default 0
  created_at: string; // timestamptz → ISO string
  updated_at: string; // timestamptz → ISO string
}

/**
 * The fields a card-write path proposes. The persisted `verification_status` is
 * derived by the gate (card-gating.ts), never set directly by the writer — so
 * it is intentionally omitted here. Commerce fields (commerce_enabled +
 * price/terms) are omitted too: their ONLY write path is the set_card_commerce
 * definer RPC (0014) — single-canonical-write-path rule.
 */
export type CardDraft = Pick<
  Card,
  | 'title'
  | 'kind'
  | 'see_perm'
  | 'act_perm'
  | 'verification_required'
> &
  Partial<Pick<Card, 'fields' | 'display_order'>>;
