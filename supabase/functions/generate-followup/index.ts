// supabase/functions/generate-followup/index.ts
//
// Edge Function for the Deus card-seeding onboarding (Phase 4 / Day 10.2).
// Receives the ONE thing a person said they want to be findable for, calls
// Anthropic Messages (Opus), and returns a single warm, specific follow-up
// question that reflects understanding and draws out a more findable detail.
//
// This is COMPREHENSION to enrich a card — NOT classification into a template.
// There is no category list, no confidence score, no pick-list. The model
// returns one question, in the person's own register.
//
// Why server-side: the Anthropic API key lives in this function's secrets
// (`supabase secrets set ANTHROPIC_API_KEY=...`), never in the client bundle.
// The Node-only @anthropic-ai/sdk crashes the RN bundle on `node:fs`; this uses
// raw fetch — the same pattern as classify-business.
//
// Param handling mirrors the working classify-business call and is confirmed
// correct for claude-opus-4-8: NO temperature/top_p/top_k (they 400 on Opus
// 4.7/4.8), `output_config.effort` is the GA control, anthropic-version
// 2023-06-01. With `thinking` omitted Opus 4.8 can leak reasoning into the
// visible text, so the system prompt forces "output ONLY the question" and the
// client defensively cleans the output.
//
// Auth: rejects requests without a valid Supabase user JWT — only signed-in
// users mid-onboarding may invoke it.
//
// Fallback contract: this function NEVER 500s on a model failure. Every failure
// path returns 200 with `{ "question": null }`, and the client falls back to a
// static follow-up so onboarding never blocks on the API.
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_TOKENS = 256;
const TIMEOUT_MS = 12_000;
// Reasonable ceiling for what a person types as "one thing to be found for".
const MAX_INPUT_CHARS = 600;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
// Own default — deliberately NOT the shared ANTHROPIC_MODEL classify-business
// reads (which defaults to claude-opus-4-7), so this fn can't silently inherit
// 4-7. Override only via FOLLOWUP_MODEL if ops ever needs to pin it.
const ANTHROPIC_MODEL =
  Deno.env.get('FOLLOWUP_MODEL') ?? 'claude-opus-4-8';

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

const SYSTEM_PROMPT = [
  "you help someone set up how people — and people's assistants — can find and",
  'reach them.',
  '',
  'they just told you ONE thing they want to be findable for. reflect that you',
  'understood it, then ask ONE warm, specific follow-up that draws out a concrete',
  'detail making them easier to find and reach.',
  '',
  'rules:',
  '- ask exactly ONE question. never stack multiple questions.',
  '- reflect understanding first in a few words ("got it — a wedding',
  '  photographer"), then ask.',
  '- be specific to what they actually said. a consultant: what they consult on',
  '  and who hires them. a teacher: what and who they teach. a plumber: what kind',
  '  of jobs, and where.',
  '- if their answer is vague ("i help people", "freelance"), do NOT guess what',
  '  they mean — ask warmly what kind, so they feel heard rather than boxed in.',
  "- draw out what helps someone's assistant decide whether to reach them: what",
  "  exactly they offer, who it's for, or where they are.",
  '- keep it light and non-intrusive; never ask for anything sensitive or private.',
  '- spare, lowercase, human. one or two short sentences, total.',
  '- never sort them into a category, type, or bucket. never offer options or a',
  '  list to pick from. never ask them to choose between things.',
  '- never use the words "schema", "template", "category", "profile", "field", or',
  '  any technical or system terms.',
  '- no greeting, no preamble, no sign-off. output ONLY the question, nothing else.',
].join('\n');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The fallback payload — the client turns a null question into a static one. */
function nullQuestion(reason: string): { question: null; reason: string } {
  return { question: null, reason };
}

/**
 * Pulls the text out of an Anthropic Messages response and returns a single
 * cleaned question, or null if nothing usable came back. Strips wrapping quotes
 * and, defensively against Opus 4.8 reasoning-leak, keeps the last non-empty
 * line (the actual question), capped to a sane length.
 */
function parseFollowup(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) {
    console.warn('[generate-followup] anthropic response was not an object');
    return null;
  }
  const content = (body as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    console.warn('[generate-followup] response missing content array');
    return null;
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

  const joined = parts.join('').trim();
  if (joined.length === 0) {
    console.warn('[generate-followup] response contained no text');
    return null;
  }

  // Keep the last non-empty line — if any reasoning preamble leaked in, the
  // question is the final line.
  const lines = joined
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  let question = lines.length > 0 ? lines[lines.length - 1] : joined;

  // Strip a single layer of wrapping quotes.
  question = question.replace(/^["'“”]+/, '').replace(/["'“”]+$/, '').trim();

  if (question.length === 0) {
    return null;
  }
  // Hard cap — a runaway response is not a usable one-line question.
  if (question.length > 300) {
    console.warn('[generate-followup] question exceeded length cap; rejecting');
    return null;
  }
  return question;
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
      console.warn('[generate-followup] auth.getUser failed:', error);
    }
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

  // 2. Parse the body — the one thing they want to be findable for.
  let answer: string;
  try {
    const body: unknown = await req.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as { answer?: unknown }).answer !== 'string'
    ) {
      return jsonResponse({ error: 'invalid_body' }, 400);
    }
    answer = (body as { answer: string }).answer.trim().slice(0, MAX_INPUT_CHARS);
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  if (answer.length === 0) {
    // Nothing to enrich — let the client use its static follow-up.
    return jsonResponse(nullQuestion('empty_answer'));
  }

  // 3. Call Anthropic. Any failure resolves to a null question (200), so the
  //    client falls back to a static follow-up — onboarding never blocks.
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let question: string | null = null;
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
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `the person wants to be findable for: "${answer}"`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`[generate-followup] anthropic status ${res.status}: ${txt}`);
    } else {
      const body: unknown = await res.json();
      question = parseFollowup(body);
    }
  } catch (err) {
    if ((err as { name?: unknown }).name === 'AbortError') {
      console.warn('[generate-followup] anthropic call timed out');
    } else {
      console.warn('[generate-followup] anthropic call failed:', err);
    }
  } finally {
    clearTimeout(timeoutId);
  }

  console.log('[generate-followup]', {
    user_id: userId,
    answer_length: answer.length,
    produced_question: question !== null,
    latency_ms: Date.now() - startedAt,
  });

  if (question === null) {
    return jsonResponse(nullQuestion('no_question'));
  }
  return jsonResponse({ question });
});
