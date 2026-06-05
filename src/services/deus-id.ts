/**
 * deus-id — mints the public 6-digit Deus address stored on `entities.deus_id`.
 *
 * `deus_id` is a TEXT column with a UNIQUE constraint and NO database-side
 * generator (see hearth-network/migrations/0000_card_model.sql). hearth-pos is
 * currently the ONLY writer of new entities — the network reads them and never
 * mints — so allocation happens app-side and the unique index is the collision
 * backstop: EntityContext retries on a `23505` deus_id violation. This module
 * only produces a candidate; it never touches the database.
 *
 * Range: [100000, 999999] — the 6-digit namespace (~900k addresses), matching
 * the seeded entities (Blue Hour Coffee 184203, Derrick Wilson 100001). Those
 * two seeds are reserved so a fresh mint never deliberately reuses them; any
 * real collision (including against rows we can't see under RLS) is caught by
 * the unique-constraint retry in EntityContext.
 *
 * Extensible past 1M: `deus_id` is text and values are zero-padded to at least 6
 * digits, so widening to a 7-digit namespace once the 6-digit space saturates is
 * a one-line bump of `DEUS_ID_MAX` — no column type or format change required.
 */
export const DEUS_ID_MIN = 100000;
export const DEUS_ID_MAX = 999999;

// Existing seed addresses — never minted for a new entity.
const RESERVED_DEUS_IDS = new Set(['100001', '184203']);

/** Returns a candidate 6-digit (zero-padded) deus_id, excluding seed values. */
export function mintDeusId(): string {
  const span = DEUS_ID_MAX - DEUS_ID_MIN + 1;
  const value = DEUS_ID_MIN + Math.floor(Math.random() * span);
  const candidate = String(value).padStart(6, '0');
  return RESERVED_DEUS_IDS.has(candidate) ? mintDeusId() : candidate;
}
