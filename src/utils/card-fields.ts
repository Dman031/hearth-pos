/**
 * card-fields — the client-side reader for a card's `fields` jsonb.
 *
 * The canonical card-model shape (hearth-network 0000_card_model.sql / its
 * CardField) is an ARRAY of { label, value }. But onboarding wrote a card's
 * single detail as an OBJECT — `{ note: "..." }` — and some cards have no fields
 * at all (null). This reader normalizes ALL of those into a FieldEntry[] so the
 * Profile list and editor render uniformly, and so legacy {note} cards can be
 * upgraded to the canonical array the first time they're edited.
 *
 * The network's embed-core.composeEmbeddingText tolerates the same shapes, so a
 * card stays searchable before and after this blob→structured migration.
 */

/**
 * One user-named field: a label and its value, in the user's own words.
 *
 * `available` is the Day 13 fulfillment flag and is OPTIONAL by design: a field
 * carries it ONLY when it is an orderable item (a menu item, a service, a slot).
 * A plain describing field (where / hours) must NOT carry it. Presence of a
 * boolean `available` is therefore what makes a field "fulfillable" (and shows
 * the 86 toggle); absence means it's just an info row. This mirrors the frozen
 * network contract exactly (hearth-network src/tools/shared.ts CardField:
 * "a describing field must not gain a fake available:true"). `false` = 86'd /
 * sold out (reported, never an access gate).
 */
export interface FieldEntry {
  label: string;
  value: string;
  available?: boolean;
}

/** A field is a fulfillable item iff it carries a boolean `available` flag. */
export function isItemField(entry: FieldEntry): boolean {
  return typeof entry.available === 'boolean';
}

function toStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return '';
  return String(v);
}

/**
 * Normalizes a card's `fields` jsonb into a FieldEntry[].
 *   • array of { label, value }  → used directly (canonical shape)
 *   • plain object (e.g. {note}) → one entry per key (label = key)
 *   • null / anything else       → []
 * Entries with an empty label AND empty value are dropped.
 */
export function normalizeFields(fields: unknown): FieldEntry[] {
  const out: FieldEntry[] = [];

  if (Array.isArray(fields)) {
    for (const f of fields) {
      if (f && typeof f === 'object') {
        const r = f as Record<string, unknown>;
        const label = toStr(r.label).trim();
        const value = toStr(r.value).trim();
        if (label || value) {
          const entry: FieldEntry = { label, value };
          // Preserve availability ONLY when the field actually carries a
          // boolean — a describing field must not gain a fake `available`
          // (mirrors hearth-network normalizeFields).
          if (typeof r.available === 'boolean') {
            entry.available = r.available;
          }
          out.push(entry);
        }
      }
    }
  } else if (fields && typeof fields === 'object') {
    for (const [key, raw] of Object.entries(fields as Record<string, unknown>)) {
      const label = key.trim();
      const value = toStr(raw).trim();
      if (label || value) out.push({ label, value });
    }
  }

  return out;
}

/**
 * Reserved field label that carries a content card's media inside the canonical
 * fields[] array. Day 12 stores a user-pasted image URL here; Day 12.5's upload
 * flow writes the resulting Supabase Storage URL into this SAME field — nothing
 * downstream assumes the URL was user-typed (see TODO(Day 12.5) seam in
 * CardEditorSheet). Media lives in the existing `fields` jsonb, NOT a new
 * column, so the frozen hearth-network card contract is untouched.
 */
export const MEDIA_FIELD_LABEL = 'media_url';

/** The media URL stored on a card's fields, or '' when none. */
export function getMediaUrl(fields: unknown): string {
  const entry = normalizeFields(fields).find(
    (f) => f.label === MEDIA_FIELD_LABEL,
  );
  return entry?.value ?? '';
}

/**
 * Upserts the reserved media-URL entry into a FieldEntry[]. An empty/whitespace
 * url REMOVES the entry — so clearing the URL, or switching a card away from the
 * content flavor, leaves no orphan media field. The reserved entry is kept last.
 */
export function setMediaUrl(entries: FieldEntry[], url: string): FieldEntry[] {
  const rest = entries.filter((f) => f.label !== MEDIA_FIELD_LABEL);
  const trimmed = url.trim();
  return trimmed ? [...rest, { label: MEDIA_FIELD_LABEL, value: trimmed }] : rest;
}

/** A card's user-facing fields with the reserved media entry removed. */
export function withoutMediaField(entries: FieldEntry[]): FieldEntry[] {
  return entries.filter((f) => f.label !== MEDIA_FIELD_LABEL);
}

/**
 * Reserved field label for ONE gallery image on a content card (Day 15). Unlike
 * media_url (a single entry), gallery images are stored as REPEATED entries —
 * one `{label:'gallery_image', value:<url>}` per photo, in display order — so a
 * content card can hold a whole portfolio inside the existing `fields` jsonb with
 * NO schema change and NO hearth-network change (the network's normalizeFields
 * passes each {label,value} through untouched; the gallery is reconstructed
 * caller-side by filtering on this label).
 *
 * CONTRACT MIRROR: this string is duplicated in
 * supabase/functions/_shared/embed-core.ts (RESERVED_EMBED_SKIP_LABELS) so the
 * URLs are excluded from the search embedding. Changing it here MUST change it
 * there (and warrants a force-all backfill re-embed). See [[BUG-006]].
 */
export const GALLERY_FIELD_LABEL = 'gallery_image';

/** Max gallery images per card — a UX/storage ceiling (see useGalleryUpload). */
export const MAX_GALLERY_IMAGES = 12;

/** Every reserved (machine-only) field label — hidden from the user field editor. */
export const RESERVED_FIELD_LABELS: ReadonlySet<string> = new Set([
  MEDIA_FIELD_LABEL,
  GALLERY_FIELD_LABEL,
]);

/** True when a label names a reserved machine field (media/gallery URL carrier). */
export function isReservedFieldLabel(label: string): boolean {
  return RESERVED_FIELD_LABELS.has(label);
}

/** A card's user-facing fields with ALL reserved entries (media + gallery) removed. */
export function withoutReservedFields(entries: FieldEntry[]): FieldEntry[] {
  return entries.filter((f) => !RESERVED_FIELD_LABELS.has(f.label));
}

/** The gallery image URLs stored on a card's fields, in stored (display) order. */
export function getGalleryUrls(fields: unknown): string[] {
  return normalizeFields(fields)
    .filter((f) => f.label === GALLERY_FIELD_LABEL)
    .map((f) => f.value.trim())
    .filter((v) => v.length > 0);
}

/**
 * Replaces the gallery entries in a FieldEntry[] with one reserved entry per url
 * (order preserved, blanks dropped, capped at MAX_GALLERY_IMAGES). Existing
 * gallery entries are stripped first, so this is an idempotent upsert. Reserved
 * entries are kept last so user fields stay at the front of the editor.
 */
export function setGalleryUrls(entries: FieldEntry[], urls: string[]): FieldEntry[] {
  const rest = entries.filter((f) => f.label !== GALLERY_FIELD_LABEL);
  const gallery = urls
    .map((u) => u.trim())
    .filter((u) => u.length > 0)
    .slice(0, MAX_GALLERY_IMAGES)
    .map((value) => ({ label: GALLERY_FIELD_LABEL, value }));
  return [...rest, ...gallery];
}

/**
 * The value to persist back to `fields`: the canonical array, or null when the
 * card has no fields (matches the column default and how createCard stores "no
 * detail"). Trims and drops fully-empty entries.
 */
export function fieldsToPersist(entries: FieldEntry[]): FieldEntry[] | null {
  const cleaned = entries
    .map((e) => {
      const next: FieldEntry = { label: e.label.trim(), value: e.value.trim() };
      // Carry the fulfillment flag through ONLY when it's a real boolean, so an
      // orderable item keeps its 86 state but a describing field never gains one.
      if (typeof e.available === 'boolean') {
        next.available = e.available;
      }
      return next;
    })
    .filter((e) => e.label || e.value);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Returns a new array with the entry at `index` flipped to `available`. The
 * target MUST already be an item field (carry a boolean `available`) — a no-op
 * otherwise, so a describing field can never be accidentally 86'd. Used by the
 * one-tap toggle's non-embedding write path (CardContext.setFieldAvailability).
 */
export function setAvailabilityAt(
  entries: FieldEntry[],
  index: number,
  available: boolean,
): FieldEntry[] {
  return entries.map((e, i) =>
    i === index && typeof e.available === 'boolean' ? { ...e, available } : e,
  );
}
