/**
 * classifier
 *
 * Thin client for the `classify-business` Supabase Edge Function. The Anthropic
 * API key, the Anthropic call, the 20s timeout, the model-response defensive
 * JSON parsing, and the confidence/isFallback rules all live server-side now —
 * the app never imports the Anthropic SDK. Every failure path still resolves
 * to a fallback ClassificationResult; `classifyBusiness` never throws.
 *
 * The hook signature, ClassificationResult shape, fallback object, and the
 * `[classifier]` log are unchanged from the previous in-app implementation.
 */
import { supabase } from './supabase';

export interface ClassificationResult {
  category: string;
  confidence: number;
  reasoning: string;
  isFallback: boolean;
}

const FALLBACK_CATEGORY = 'generic_service';

function fallbackResult(reasoning: string): ClassificationResult {
  return {
    category: FALLBACK_CATEGORY,
    confidence: 0,
    reasoning,
    isFallback: true,
  };
}

/** Lightweight shape-check of the Edge Function's JSON payload. */
function parsePayload(value: unknown): ClassificationResult | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { category, confidence, reasoning, isFallback } = value as Record<
    string,
    unknown
  >;
  if (
    typeof category !== 'string' ||
    typeof confidence !== 'number' ||
    Number.isNaN(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    typeof reasoning !== 'string' ||
    typeof isFallback !== 'boolean'
  ) {
    return null;
  }
  return { category, confidence, reasoning, isFallback };
}

/**
 * Classifies a vendor business description by invoking the
 * `classify-business` Edge Function. Never throws.
 */
export async function classifyBusiness(
  description: string,
): Promise<ClassificationResult> {
  const startedAt = Date.now();
  let result: ClassificationResult;

  try {
    const { data, error } = await supabase.functions.invoke(
      'classify-business',
      { body: { description } },
    );

    if (error) {
      console.warn('[classifier] edge function failed:', error);
      result = fallbackResult('classification_failed');
    } else {
      const parsed = parsePayload(data);
      if (parsed === null) {
        console.warn(
          '[classifier] edge function returned malformed payload:',
          data,
        );
        result = fallbackResult('classification_failed');
      } else {
        result = parsed;
      }
    }
  } catch (err) {
    console.warn('[classifier] edge function invoke threw:', err);
    result = fallbackResult('classification_failed');
  }

  console.log('[classifier]', {
    description_length: description.length,
    category: result.category,
    confidence: result.confidence,
    isFallback: result.isFallback,
    latency_ms: Date.now() - startedAt,
  });

  return result;
}
