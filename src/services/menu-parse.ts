/**
 * menu-parse
 *
 * Thin client for the `parse-menu` Supabase Edge Function (Day 14 / Step 4.5).
 * Given the PUBLIC card-media URL of a menu photo, it returns a PROPOSED card
 * title + fields in the frozen fulfillable shape (orderable items carry
 * `available: true`; describing rows don't), which the caller seeds into
 * CardEditorSheet for the owner to review and commit.
 *
 * Mirrors src/services/followup.ts: the Anthropic key, the Opus VISION call, the
 * schema-enforced JSON, the timeout, and the shaping all live server-side; the
 * app never imports the Anthropic SDK. Every failure path resolves to a
 * `fallback` result — this function NEVER throws — so the caller can open an
 * editable card with just the photo and never hit a dead end.
 *
 * GOVERNING PRINCIPLE: parse proposes, human commits. Nothing here writes a
 * card; the result only seeds the editor.
 */
import { supabase } from './supabase';
import type { FieldEntry } from '../utils/card-fields';

export interface MenuParseResult {
  /** Proposed card title (may be '' — the editor's title field is editable). */
  title: string;
  /**
   * Proposed fields in the frozen fulfillable shape: orderable items carry a
   * boolean `available` (true); describing rows omit it. Seeds the editor's
   * field list directly (these are USER fields — no reserved media entry).
   */
  fields: FieldEntry[];
  /**
   * True when the parse produced nothing usable (error, refusal, timeout, empty
   * image). The caller opens an editable empty card with the photo attached.
   */
  fallback: boolean;
}

/** Coerces one server field entry into a FieldEntry, or null if unusable. */
function toFieldEntry(value: unknown): FieldEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  const label = typeof r.label === 'string' ? r.label.trim() : '';
  const value_ = typeof r.value === 'string' ? r.value.trim() : '';
  if (!label && !value_) return null;
  const entry: FieldEntry = { label, value: value_ };
  // Preserve the orderable flag ONLY when it's a real boolean — a describing row
  // must not gain a fake `available` (mirrors the frozen network contract).
  if (typeof r.available === 'boolean') entry.available = r.available;
  return entry;
}

/**
 * Asks the `parse-menu` Edge Function to turn a menu photo into proposed card
 * fields. Never throws; returns `{ fallback: true, fields: [] }` on any error,
 * timeout, refusal, or empty result so the caller seeds an editable card.
 */
export async function parseMenu(imageUrl: string): Promise<MenuParseResult> {
  const startedAt = Date.now();
  let title = '';
  let fields: FieldEntry[] = [];
  let fallback = true;

  try {
    const { data, error } = await supabase.functions.invoke('parse-menu', {
      body: { image_url: imageUrl },
    });

    if (error) {
      console.warn('[menu-parse] edge function failed:', error);
    } else if (typeof data === 'object' && data !== null) {
      const d = data as {
        title?: unknown;
        fields?: unknown;
        fallback?: unknown;
      };
      title = typeof d.title === 'string' ? d.title : '';
      fields = Array.isArray(d.fields)
        ? d.fields.map(toFieldEntry).filter((f): f is FieldEntry => f !== null)
        : [];
      // Trust the server's fallback flag, but also treat an empty field list as
      // a fallback so the caller never opens a seeded-but-blank editor.
      fallback = d.fallback === true || fields.length === 0;
    } else {
      console.warn('[menu-parse] edge function returned malformed payload:', data);
    }
  } catch (err) {
    console.warn('[menu-parse] edge function invoke threw:', err);
  }

  console.log('[menu-parse]', {
    item_count: fields.filter((f) => typeof f.available === 'boolean').length,
    detail_count: fields.filter((f) => typeof f.available !== 'boolean').length,
    fallback,
    latency_ms: Date.now() - startedAt,
  });

  return { title, fields, fallback };
}
