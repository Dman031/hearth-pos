/**
 * Entity — mirrors the live `public.entities` table (the Deus card-model owner
 * record) that hearth-network reads. The shape is authoritative per
 * hearth-network/migrations/0000_card_model.sql. Do NOT add app-only fields
 * here that do not exist on the table — the network reads this contract.
 *
 * One login = one entity (`user_id` is UNIQUE). `deus_id` is the UNIQUE public
 * 6-digit address. There is intentionally NO phone-verified column: phone
 * confirmation is auth-native (`auth.users.phone_confirmed_at`, Decision 1A)
 * once SMS is wired. See TODO(SMS) in EntityContext / EntitySetupScreen.
 */
export interface Entity {
  id: string; // uuid PK
  user_id: string | null; // uuid, UNIQUE, FK auth.users (null for seeded/system entities)
  deus_id: string | null; // text, UNIQUE — the 6-digit public address
  display_name: string | null;
  email: string | null;
  phone: string | null; // stored as entered; verification deferred — TODO(SMS)
  entity_type: string; // not null, default 'person'
  id_verified: boolean; // not null, default false
  business_verified: boolean; // not null, default false
  credential_verified: boolean; // not null, default false
  status: string; // not null, default 'active'
  // The practice's own zone (0038b), stored as an IANA name via
  // set_entity_timezone. NULL = never confirmed. Every rendered time is placed
  // in THIS value, not the device zone — a clinician on a trip still sees their
  // board in their practice's zone (PLEXMED S5 note 3).
  timezone: string | null;
  // Set = no transactional mail (0043). The sender re-reads this at send time,
  // so turning it off skips a row that is already queued. Default is ON, which
  // is this column being NULL.
  email_opt_out_at: string | null; // timestamptz → ISO string
  created_at: string; // timestamptz → ISO string
  updated_at: string; // timestamptz → ISO string
}

/** The fields hearth-pos collects at signup to create an entity. */
export interface CreateEntityInput {
  display_name: string;
  email: string | null;
  phone: string | null;
}
