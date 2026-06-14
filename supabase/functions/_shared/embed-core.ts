// embed-core — shared write-side embedding logic for the edge functions.
//
// Calls Cloudflare Workers AI over the REST API (the "asymmetry": the network
// Worker uses the native AI binding, but pos edge functions are Deno and call
// the same model over HTTPS with a CF API token — a standard fetch). Both sides
// use the SAME model/pooling/dims via _shared/embedding-config.ts so vectors are
// comparable. Used by both `embed-card` (one card) and `backfill-embeddings`.
/// <reference lib="deno.ns" />

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EMBED_MODEL, EMBED_POOLING, EMBED_STAMP } from './embedding-config.ts';

const CF_TIMEOUT_MS = 12_000;
// bge caps input at 512 tokens; cap chars well under that to avoid truncation
// surprises (rough ~4 chars/token).
const MAX_EMBED_CHARS = 1800;

export interface EmbeddableCard {
  id: string;
  title: string;
  fields: unknown;
}

/**
 * Builds the text to embed from a card. Tolerant of BOTH field shapes seen in
 * the data: an array of {label,value} (the Day 11-12 structured shape) AND a
 * plain object like {note:"..."} (today's onboarding shape). Title always leads.
 */
export function composeEmbeddingText(title: string, fields: unknown): string {
  const parts: string[] = [];
  if (typeof title === 'string' && title.trim()) parts.push(title.trim());

  if (Array.isArray(fields)) {
    for (const f of fields) {
      if (f && typeof f === 'object') {
        const r = f as Record<string, unknown>;
        if (typeof r.label === 'string' && r.label.trim()) parts.push(r.label.trim());
        if (typeof r.value === 'string' && r.value.trim()) parts.push(r.value.trim());
      }
    }
  } else if (fields && typeof fields === 'object') {
    for (const v of Object.values(fields as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) parts.push(v.trim());
      else if (v !== null && v !== undefined && typeof v !== 'object') parts.push(String(v));
    }
  }

  return parts.join('. ').slice(0, MAX_EMBED_CHARS);
}

/**
 * Embeds text via Cloudflare Workers AI REST. Returns the 768-float vector, or
 * null on any failure/timeout (callers treat null as "leave embedding unset" —
 * the card stays findable via the network's substring fallback and the backfill
 * re-embeds it later). Never throws.
 */
export async function embedText(
  text: string,
  accountId: string,
  apiToken: string,
): Promise<number[] | null> {
  if (!text.trim()) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CF_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${EMBED_MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text, pooling: EMBED_POOLING }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[embed-core] Cloudflare AI status ${res.status}: ${body}`);
      return null;
    }
    const json: unknown = await res.json();
    const vector = (json as { result?: { data?: unknown[][] } })?.result?.data?.[0];
    if (!Array.isArray(vector) || vector.length === 0) {
      console.warn('[embed-core] Cloudflare AI returned no vector', json);
      return null;
    }
    return vector as number[];
  } catch (err) {
    if ((err as { name?: unknown }).name === 'AbortError') {
      console.warn('[embed-core] Cloudflare AI call timed out');
    } else {
      console.warn('[embed-core] Cloudflare AI call failed:', err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Embeds one card and writes embedding + embedding_model via the service-role
 * client. Returns true on success. SUPABASE WRITE RULE: destructures {error},
 * chains .select() to confirm the row was affected (zero rows = failure).
 */
export async function embedAndStore(
  supabase: SupabaseClient,
  card: EmbeddableCard,
  accountId: string,
  apiToken: string,
): Promise<boolean> {
  const text = composeEmbeddingText(card.title, card.fields);
  const vector = await embedText(text, accountId, apiToken);
  if (!vector) return false;

  const { data, error } = await supabase
    .from('cards')
    .update({ embedding: vector, embedding_model: EMBED_STAMP })
    .eq('id', card.id)
    .select('id');

  if (error) {
    console.warn('[embed-core] cards update failed:', error.message);
    return false;
  }
  if (!data || data.length === 0) {
    // Zero rows on a PK match is a silent-block signature — treat as failure.
    console.warn('[embed-core] cards update affected no rows for', card.id);
    return false;
  }
  return true;
}
