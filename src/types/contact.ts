/**
 * Contact — one saved entry in the owner's PRIVATE, DIRECTIONAL rolodex, as
 * returned by the `get_my_contacts()` SECURITY DEFINER RPC
 * (hearth-network/migrations/0012_contacts.sql). The RPC returns ONLY the peer's
 * PUBLIC fields (no PII) — this shape must match its return columns exactly.
 *
 * A saved contact is a private list entry only; it grants NO reach (17B is a
 * separate build). The `contacts` table is directional and distinct from the
 * symmetric `connections` table — do not conflate them.
 */
export interface Contact {
  contact_entity_id: string; // uuid — the saved peer's entity id
  display_name: string | null;
  deus_id: string | null; // the peer's public 6-digit address
  entity_type: string | null;
  id_verified: boolean;
  business_verified: boolean;
  credential_verified: boolean;
}
