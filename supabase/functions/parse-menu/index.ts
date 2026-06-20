// supabase/functions/parse-menu/index.ts
//
// Edge Function for Day 14 / Step 4.5 — menu photo → a PROPOSED fulfillable
// Menu card. Receives the PUBLIC card-media URL of a menu photo (uploaded by the
// Day 12.5 machinery), calls Anthropic Messages (Opus, VISION) with a
// schema-enforced JSON output, and returns the proposed card title + fields in
// the EXACT frozen fulfillable shape Day 13 created:
//   • orderable item  → { label, value, available: true }
//   • describing row  → { label, value }   (NO `available` key)
//
// GOVERNING PRINCIPLE: parse PROPOSES, human COMMITS. The parse is allowed to be
// wrong — nothing publishes from here. The app seeds CardEditorSheet with this
// output; the owner reviews/edits and only Save → createCard commits. So this
// function never needs to be perfect, only safe and shaped.
//
// Why server-side: the Anthropic API key lives in this function's secrets
// (`supabase secrets set ANTHROPIC_API_KEY=...`), never in the client bundle.
// Raw fetch (the @anthropic-ai/sdk crashes the RN bundle on node:fs) — the same
// pattern as the LIVE generate-followup function, which this clones.
//
// Param handling mirrors the working generate-followup call and is confirmed
// correct for claude-opus-4-8: NO temperature/top_p/top_k (they 400 on Opus
// 4.7/4.8), `output_config.effort` is the GA control, anthropic-version
// 2023-06-01. ADDED here vs followup: a vision image content block (source
// type "url") and `output_config.format` (json_schema) so the JSON shape is
// API-GUARANTEED — we drop the stripJsonFences + malformed-JSON reparse +
// manual shape re-validation that classify-business needed.
//
// PROMPT-CODE CONTRACT: the `available` flag is stamped SERVER-SIDE — the model
// classifies each line into `items` (orderable) vs `details` (describing); the
// schema does not even contain an `available` field, and the server alone sets
// available:true on items. The model's shape is never trusted to drive it.
//
// Auth: rejects requests without a valid Supabase user JWT — only signed-in
// owners may invoke it.
//
// Fallback contract: this function NEVER 500s on a model/parse failure. Every
// failure path returns 200 with `{ fallback: true, title: '', fields: [] }`, and
// the client opens an EDITABLE empty card with the photo attached — never a dead
// end. KEPT: empty/garbage-content fallback + `stop_reason === 'refusal'`
// handling (the schema guarantees shape, not cooperation or correctness).
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_TOKENS = 4096;
const TIMEOUT_MS = 30_000;
const MAX_URL_CHARS = 2048;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
// Own default — deliberately NOT the shared ANTHROPIC_MODEL classify-business
// reads, so this fn can't silently inherit a stale 4-7 pin. Mirrors
// generate-followup's FOLLOWUP_MODEL decoupling. Override only via
// MENU_PARSE_MODEL if ops ever needs to pin it.
const ANTHROPIC_MODEL = Deno.env.get('MENU_PARSE_MODEL') ?? 'claude-opus-4-8';

if (!ANTHROPIC_API_KEY) {
  throw new Error(
    'Missing ANTHROPIC_API_KEY. Run `supabase secrets set ANTHROPIC_API_KEY=...`.',
  );
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase env vars (these are auto-injected by the Edge runtime).',
  );
}

// Schema-enforced output. Constraints honored: object/array/string only, every
// object carries additionalProperties:false (required by structured outputs); NO
// minLength/maxLength/numeric bounds (unsupported). `available` is DELIBERATELY
// absent — the server stamps it; the model only sorts lines into items vs details.
const MENU_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['label', 'value'],
      },
    },
    details: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['label', 'value'],
      },
    },
  },
  required: ['title', 'items', 'details'],
};

const SYSTEM_PROMPT = [
  'you read a photo of a menu (or price list / services list) and turn it into a',
  'card someone can be found and ordered from. extract ONLY what is visibly on the',
  'image — never invent dishes, prices, or details that are not shown.',
  '',
  'return JSON matching the provided schema:',
  '- "title": a short name for the card — the business or menu name if shown,',
  '  otherwise a plain noun for what this is (e.g. "Menu", "Lunch menu").',
  '- "items": each ORDERABLE thing — a dish, drink, service, or package. for each,',
  '  "label" is its name and "value" is its price and/or a short description, in the',
  '  words on the menu (e.g. label "Margherita", value "$16 — tomato, basil,',
  '  mozzarella"). if there is no price, put whatever description is shown, or "".',
  '- "details": NON-orderable info shown on the menu — hours, address, phone,',
  '  "cash only", etc. "label" names it ("Hours", "Address"), "value" is the text.',
  '  leave this an empty array if there is none.',
  '',
  'rules:',
  '- transcribe faithfully; do not paraphrase prices or correct spelling.',
  '- a thing someone could order is an item; standing info about the place is a',
  '  detail. when unsure, prefer item.',
  '- if the image is not a menu, is unreadable, or shows no orderable things,',
  '  return a sensible "title" and empty "items"/"details" — do not fabricate.',
  '- never include any field other than label/value on an entry.',
].join('\n');

interface FieldEntry {
  label: string;
  value: string;
  available?: boolean;
}

interface MenuParseResult {
  title: string;
  fields: FieldEntry[];
  fallback: boolean;
  reason?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The fallback payload — the client opens an editable empty card + the photo. */
function fallbackResult(reason: string): MenuParseResult {
  return { title: '', fields: [], fallback: true, reason };
}

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Builds the card fields from the model's schema-guaranteed JSON. The schema
 * guarantees {title, items[], details[]} with string label/value — so this is
 * OUTPUT CONSTRUCTION + the PROMPT-CODE CONTRACT (stamping available:true on
 * items, omitting it on details), NOT a re-validation of model JSON. Array
 * guards are defensive only (never crash); a malformed parse is caught by the
 * caller's try/catch and becomes a fallback, not a 500.
 */
function buildResult(parsed: unknown): MenuParseResult {
  if (typeof parsed !== 'object' || parsed === null) {
    return fallbackResult('parse_not_object');
  }
  const p = parsed as Record<string, unknown>;
  const title = toStr(p.title).trim();
  const rawItems = Array.isArray(p.items) ? p.items : [];
  const rawDetails = Array.isArray(p.details) ? p.details : [];

  const fields: FieldEntry[] = [];
  // Orderable items — server stamps available:true so the Day 13 86-toggle works.
  for (const it of rawItems) {
    if (typeof it !== 'object' || it === null) continue;
    const r = it as Record<string, unknown>;
    const label = toStr(r.label).trim();
    const value = toStr(r.value).trim();
    if (label || value) fields.push({ label, value, available: true });
  }
  // Describing rows — NO available key (mirrors the frozen network contract:
  // a describing field must not gain a fake available).
  for (const d of rawDetails) {
    if (typeof d !== 'object' || d === null) continue;
    const r = d as Record<string, unknown>;
    const label = toStr(r.label).trim();
    const value = toStr(r.value).trim();
    if (label || value) fields.push({ label, value });
  }

  // Empty/garbage-content fallback: a "successful" parse with nothing usable is
  // still a fallback — the client opens an editable card with just the photo.
  if (fields.length === 0 && title.length === 0) {
    return fallbackResult('empty_parse');
  }
  return { title, fields, fallback: false };
}

/** Extracts the concatenated text of all text blocks, or '' if none. */
function extractText(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const content = (body as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: unknown }).type === 'text'
    ) {
      const t = (block as { text?: unknown }).text;
      if (typeof t === 'string') parts.push(t);
    }
  }
  return parts.join('').trim();
}

/** Verifies the caller's JWT and returns their user id, or null. */
async function verifyUser(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    if (error) console.warn('[parse-menu] auth.getUser failed:', error);
    return null;
  }
  return data.user.id;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  // 1. Reject anonymous callers.
  const userId = await verifyUser(req.headers.get('authorization'));
  if (!userId) {
    return jsonResponse({ error: 'unauthenticated' }, 401);
  }

  // 2. Parse the body — the public URL of the uploaded menu photo.
  let imageUrl: string;
  try {
    const body: unknown = await req.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as { image_url?: unknown }).image_url !== 'string'
    ) {
      return jsonResponse({ error: 'invalid_body' }, 400);
    }
    imageUrl = (body as { image_url: string }).image_url.trim();
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  // Must be an http(s) URL (the public card-media URL). Anything else can't be
  // a vision source — reject before spending a model call.
  if (
    imageUrl.length === 0 ||
    imageUrl.length > MAX_URL_CHARS ||
    !/^https?:\/\//i.test(imageUrl)
  ) {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  // 3. Call Anthropic (vision + schema-enforced JSON). Any failure resolves to a
  //    fallback (200) so the client opens an editable card — never blocks.
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let result: MenuParseResult;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: MENU_SCHEMA },
        },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: imageUrl } },
              {
                type: 'text',
                text: 'Read this menu image and return the JSON described.',
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`[parse-menu] anthropic status ${res.status}: ${txt}`);
      result = fallbackResult('anthropic_error');
    } else {
      const body: unknown = await res.json();
      const stopReason = (body as { stop_reason?: unknown }).stop_reason;
      if (stopReason === 'refusal') {
        // Schema guarantees shape, not cooperation — the model declined.
        console.warn('[parse-menu] model refused');
        result = fallbackResult('refusal');
      } else if (stopReason === 'max_tokens') {
        // Output likely truncated → JSON incomplete; treat as fallback.
        console.warn('[parse-menu] hit max_tokens; treating as fallback');
        result = fallbackResult('max_tokens');
      } else {
        const text = extractText(body);
        if (text.length === 0) {
          result = fallbackResult('empty_content');
        } else {
          // Schema guarantees valid JSON on a clean stop_reason — a JSON.parse
          // throw here is caught by the outer try/catch and becomes a fallback,
          // so no dedicated malformed-JSON branch is needed.
          result = buildResult(JSON.parse(text));
        }
      }
    }
  } catch (err) {
    if ((err as { name?: unknown }).name === 'AbortError') {
      console.warn('[parse-menu] anthropic call timed out');
      result = fallbackResult('timeout');
    } else {
      console.warn('[parse-menu] anthropic call failed:', err);
      result = fallbackResult('exception');
    }
  } finally {
    clearTimeout(timeoutId);
  }

  console.log('[parse-menu]', {
    user_id: userId,
    item_count: result.fields.filter((f) => typeof f.available === 'boolean')
      .length,
    detail_count: result.fields.filter((f) => typeof f.available !== 'boolean')
      .length,
    fallback: result.fallback,
    reason: result.reason ?? null,
    latency_ms: Date.now() - startedAt,
  });

  return jsonResponse(result);
});
