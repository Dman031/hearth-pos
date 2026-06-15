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

/** One user-named field: a label and its value, in the user's own words. */
export interface FieldEntry {
  label: string;
  value: string;
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
        if (label || value) out.push({ label, value });
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
 * The value to persist back to `fields`: the canonical array, or null when the
 * card has no fields (matches the column default and how createCard stores "no
 * detail"). Trims and drops fully-empty entries.
 */
export function fieldsToPersist(entries: FieldEntry[]): FieldEntry[] | null {
  const cleaned = entries
    .map((e) => ({ label: e.label.trim(), value: e.value.trim() }))
    .filter((e) => e.label || e.value);
  return cleaned.length > 0 ? cleaned : null;
}
