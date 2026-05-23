// supabase/functions/classify-business/index.ts
//
// Edge Function for Hearth POS onboarding. Receives a vendor business
// description, calls Anthropic Messages with the same prompt and model the
// client used to call directly, and returns a ClassificationResult.
//
// Why server-side: the Anthropic API key lives in this function's secrets
// (`supabase secrets set ANTHROPIC_API_KEY=...`), never in the client bundle.
// The Node-only @anthropic-ai/sdk used to crash the React Native bundle on
// `node:fs`; this function uses raw fetch instead. The client now calls this
// function via `supabase.functions.invoke('classify-business', ...)`.
//
// Auth: rejects requests without a valid Supabase user JWT — only signed-in
// vendors during onboarding may invoke it. Prevents random callers from
// burning the Anthropic quota.
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ClassificationResult {
  category: string;
  confidence: number;
  reasoning: string;
  isFallback: boolean;
}

interface TemplateCategory {
  id: string;
  display_name: string;
  match_keywords: string[];
}

const FALLBACK_CATEGORY = 'generic_service';
const CONFIDENCE_THRESHOLD = 0.7;
const MAX_TOKENS = 200;
const TIMEOUT_MS = 20_000;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-4-7';

if (!ANTHROPIC_API_KEY) {
  throw new Error(
    'Missing ANTHROPIC_API_KEY. Run `supabase secrets set ANTHROPIC_API_KEY=...`.',
  );
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing Supabase env vars (these are auto-injected by the Edge runtime).',
  );
}

function fallbackResult(reasoning: string): ClassificationResult {
  return {
    category: FALLBACK_CATEGORY,
    confidence: 0,
    reasoning,
    isFallback: true,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function buildSystemPrompt(categories: TemplateCategory[]): string {
  const list = categories
    .map((c) => {
      const keywords =
        c.match_keywords.length > 0 ? c.match_keywords.join(', ') : 'none';
      return `- ${c.id} (${c.display_name}) — keywords: ${keywords}`;
    })
    .join('\n');

  return [
    'You classify a vendor business description into exactly one category',
    'for the Hearth vendor platform.',
    '',
    'Available categories (use the id, never the display name):',
    list,
    '',
    'Rules:',
    '- Choose the single best-matching category id from the list above.',
    '- The "category" value MUST be one of the listed ids, exactly as written.',
    `- If no category fits well, use "${FALLBACK_CATEGORY}" and a low confidence.`,
    '- "confidence" is your certainty as a number from 0 to 1.',
    '- "reasoning" is one short sentence explaining the choice.',
    '',
    'Respond with STRICT JSON and nothing else: no preamble, no commentary',
    'outside the JSON, no markdown code fences. The entire response must be:',
    '{"category": string, "confidence": number, "reasoning": string}',
  ].join('\n');
}

function stripJsonFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * Pulls text out of an Anthropic Messages API response and runs the same
 * defensive validation the old client-side classifier did.
 */
function parseAnthropicMessage(
  body: unknown,
  allowedIds: Set<string>,
): ClassificationResult {
  if (typeof body !== 'object' || body === null) {
    console.warn('[classify-business] anthropic response was not an object');
    return fallbackResult('classification_failed');
  }
  const content = (body as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    console.warn(
      '[classify-business] anthropic response missing content array',
    );
    return fallbackResult('classification_failed');
  }

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
  if (parts.length === 0) {
    console.warn(
      '[classify-business] anthropic response contained no text block',
    );
    return fallbackResult('classification_failed');
  }

  const cleaned = stripJsonFences(parts.join(''));
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.warn('[classify-business] could not parse model JSON:', err);
    return fallbackResult('classification_failed');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    console.warn('[classify-business] model JSON was not an object');
    return fallbackResult('classification_failed');
  }
  const { category, confidence, reasoning } = parsed as Record<string, unknown>;
  if (
    typeof category !== 'string' ||
    typeof confidence !== 'number' ||
    typeof reasoning !== 'string' ||
    Number.isNaN(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    console.warn('[classify-business] model JSON failed shape validation');
    return fallbackResult('classification_failed');
  }
  if (!allowedIds.has(category)) {
    console.warn(
      `[classify-business] model returned unknown category: "${category}"`,
    );
    return fallbackResult('classification_failed');
  }
  return {
    category,
    confidence,
    reasoning,
    isFallback: confidence < CONFIDENCE_THRESHOLD,
  };
}

/** Verifies the caller's JWT and returns their user id, or null. */
async function verifyUser(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    if (error) {
      console.warn('[classify-business] auth.getUser failed:', error);
    }
    return null;
  }
  return data.user.id;
}

/** Loads active template categories via the service role (bypasses RLS). */
async function loadCategories(): Promise<TemplateCategory[]> {
  const client = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await client
    .from('pos_templates')
    .select('id, display_name, match_keywords')
    .eq('is_active', true)
    .order('display_name', { ascending: true });
  if (error) {
    throw new Error(`pos_templates query failed: ${error.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error('pos_templates returned a non-array payload');
  }
  const out: TemplateCategory[] = [];
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    if (
      typeof r.id === 'string' &&
      typeof r.display_name === 'string' &&
      Array.isArray(r.match_keywords) &&
      r.match_keywords.every((k) => typeof k === 'string')
    ) {
      out.push({
        id: r.id,
        display_name: r.display_name,
        match_keywords: r.match_keywords as string[],
      });
    }
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  // 1. Reject anonymous callers — only signed-in vendors during onboarding.
  const userId = await verifyUser(req.headers.get('authorization'));
  if (!userId) {
    return jsonResponse({ error: 'unauthenticated' }, 401);
  }

  // 2. Parse the request body.
  let description: string;
  try {
    const body: unknown = await req.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as { description?: unknown }).description !== 'string'
    ) {
      return jsonResponse({ error: 'invalid_body' }, 400);
    }
    description = (body as { description: string }).description;
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  // 3. Load template categories from Supabase.
  let categories: TemplateCategory[];
  try {
    categories = await loadCategories();
  } catch (err) {
    console.warn('[classify-business] failed to load categories:', err);
    return jsonResponse(fallbackResult('classification_failed'));
  }
  const allowedIds = new Set(categories.map((c) => c.id));

  // 4. Call Anthropic Messages with the same prompt + model the client used.
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let result: ClassificationResult;
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
        output_config: { effort: 'low' },
        system: buildSystemPrompt(categories),
        messages: [
          { role: 'user', content: `Business description: ${description}` },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(
        `[classify-business] anthropic status ${res.status}: ${txt}`,
      );
      result = fallbackResult('classification_failed');
    } else {
      const body: unknown = await res.json();
      result = parseAnthropicMessage(body, allowedIds);
    }
  } catch (err) {
    if ((err as { name?: unknown }).name === 'AbortError') {
      console.warn('[classify-business] anthropic call timed out');
      result = fallbackResult('timeout');
    } else {
      console.warn('[classify-business] anthropic call failed:', err);
      result = fallbackResult('classification_failed');
    }
  } finally {
    clearTimeout(timeoutId);
  }

  console.log('[classify-business]', {
    user_id: userId,
    description_length: description.length,
    category: result.category,
    confidence: result.confidence,
    isFallback: result.isFallback,
    latency_ms: Date.now() - startedAt,
  });

  return jsonResponse(result);
});
