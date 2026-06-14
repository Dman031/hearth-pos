/**
 * followup
 *
 * Thin client for the `generate-followup` Supabase Edge Function. Given the one
 * thing a person said they want to be findable for, it returns ONE warm,
 * specific follow-up question that reflects understanding and draws out a more
 * findable detail (comprehension to enrich a card — NOT classification).
 *
 * Mirrors src/services/classifier.ts: the Anthropic key, the Opus call, the
 * timeout, and the defensive parsing all live server-side; the app never imports
 * the Anthropic SDK. Every failure path resolves to `{ question: null }` — this
 * function NEVER throws — so onboarding can fall back to a static follow-up and
 * never block on the API.
 */
import { supabase } from './supabase';

export interface FollowupResult {
  /** The tailored question, or null when the caller should use a static one. */
  question: string | null;
}

/** Cleans a model question: trims, strips wrapping quotes, caps length. */
function cleanQuestion(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  let q = value.trim().replace(/^["'“”]+/, '').replace(/["'“”]+$/, '').trim();
  if (q.length === 0 || q.length > 300) {
    return null;
  }
  return q;
}

/**
 * Asks the `generate-followup` Edge Function for a tailored follow-up question.
 * Never throws; returns `{ question: null }` on any error, timeout, or empty
 * model response so the caller falls back to a static prompt.
 */
export async function generateFollowup(answer: string): Promise<FollowupResult> {
  const startedAt = Date.now();
  let question: string | null = null;

  try {
    const { data, error } = await supabase.functions.invoke('generate-followup', {
      body: { answer },
    });

    if (error) {
      console.warn('[followup] edge function failed:', error);
    } else if (typeof data === 'object' && data !== null) {
      question = cleanQuestion((data as { question?: unknown }).question);
    } else {
      console.warn('[followup] edge function returned malformed payload:', data);
    }
  } catch (err) {
    console.warn('[followup] edge function invoke threw:', err);
  }

  console.log('[followup]', {
    answer_length: answer.length,
    produced_question: question !== null,
    latency_ms: Date.now() - startedAt,
  });

  return { question };
}
