/**
 * template-loader
 *
 * Loads vendor POS templates from the `pos_templates` table in Supabase and
 * caches them in memory so the app does not pay a network round-trip on every
 * render or classification.
 *
 * Cache strategy:
 * - Two module-scoped caches, each entry carrying its own 5-minute TTL:
 *     1. `templateCache`     — keyed by template id, for single-template reads.
 *     2. `allTemplatesCache` — the full active-template list.
 * - Every cache entry stores an absolute `expiresAt` timestamp. A read after
 *   that timestamp counts as a miss and triggers a fresh fetch.
 * - `fetchAllTemplates()` back-fills `templateCache` with every row it loads,
 *   so warming the list also warms subsequent `fetchTemplate()` calls.
 * - `clearTemplateCache()` drops both caches — call it from tests, or after an
 *   admin edits a template, to force the next read to hit the database.
 *
 * The TTL is a deliberate staleness budget: templates change rarely (an admin
 * JSON insert), so serving an up-to-5-minute-old template is an acceptable
 * trade for cutting Supabase reads on a hot path.
 */
import { supabase } from './supabase';
import type { TemplateConfig } from '../types/templates';

export interface Template {
  id: string;
  category: string;
  display_name: string;
  match_keywords: string[];
  config: TemplateConfig;
  version: number;
  is_active: boolean;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

const templateCache = new Map<string, CacheEntry<Template>>();
let allTemplatesCache: CacheEntry<Template[]> | null = null;

function isFresh<T>(entry: CacheEntry<T>): boolean {
  return entry.expiresAt > Date.now();
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Narrows an untyped Supabase row into a `Template`. Returns null (and warns)
 * for a malformed row so one bad record cannot poison the whole list.
 *
 * The `config` blob is confirmed to be a non-null object and otherwise trusted
 * to match `TemplateConfig`; its inner fields are validated at render time by
 * TemplateRenderer, not here.
 */
function parseTemplate(row: unknown): Template | null {
  if (typeof row !== 'object' || row === null) {
    console.warn('[template-loader] discarded row: not an object');
    return null;
  }

  const record = row as Record<string, unknown>;
  const { id, category, display_name, match_keywords, config, version } =
    record;
  const isActive = record.is_active;

  if (typeof id !== 'string') {
    console.warn('[template-loader] discarded row: missing or invalid id');
    return null;
  }
  if (
    typeof category !== 'string' ||
    typeof display_name !== 'string' ||
    typeof version !== 'number' ||
    typeof isActive !== 'boolean' ||
    !isStringArray(match_keywords) ||
    typeof config !== 'object' ||
    config === null
  ) {
    console.warn(`[template-loader] discarded malformed row: "${id}"`);
    return null;
  }

  return {
    id,
    category,
    display_name,
    match_keywords,
    config: config as TemplateConfig,
    version,
    is_active: isActive,
  };
}

function cacheTemplate(template: Template, expiresAt: number): void {
  templateCache.set(template.id, { value: template, expiresAt });
}

/**
 * Returns the active template with the given id, or null if no active template
 * matches. Never throws — a missing id, a query error, and a malformed row all
 * resolve to null after logging.
 */
export async function fetchTemplate(id: string): Promise<Template | null> {
  const cached = templateCache.get(id);
  if (cached && isFresh(cached)) {
    return cached.value;
  }

  try {
    const { data, error } = await supabase
      .from('pos_templates')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const row: unknown = data;
    if (row === null || row === undefined) {
      return null;
    }

    const template = parseTemplate(row);
    if (template === null) {
      return null;
    }

    cacheTemplate(template, Date.now() + CACHE_TTL_MS);
    return template;
  } catch (err) {
    console.warn(`[template-loader] fetchTemplate("${id}") failed:`, err);
    return null;
  }
}

/**
 * Returns every active template, ordered by display_name. Back-fills the per-id
 * cache. Logs and re-throws on an unexpected query failure rather than masking
 * an outage as an empty catalogue.
 */
export async function fetchAllTemplates(): Promise<Template[]> {
  if (allTemplatesCache && isFresh(allTemplatesCache)) {
    return allTemplatesCache.value;
  }

  let rows: unknown;
  try {
    const { data, error } = await supabase
      .from('pos_templates')
      .select('*')
      .eq('is_active', true)
      .order('display_name', { ascending: true });

    if (error) {
      throw error;
    }
    rows = data;
  } catch (err) {
    console.warn('[template-loader] fetchAllTemplates failed:', err);
    throw err;
  }

  if (!Array.isArray(rows)) {
    console.warn(
      '[template-loader] fetchAllTemplates: expected an array, received',
      typeof rows,
    );
    throw new Error(
      '[template-loader] pos_templates returned a non-array payload',
    );
  }

  const expiresAt = Date.now() + CACHE_TTL_MS;
  const templates: Template[] = [];
  for (const row of rows) {
    const template = parseTemplate(row);
    if (template !== null) {
      templates.push(template);
      cacheTemplate(template, expiresAt);
    }
  }

  allTemplatesCache = { value: templates, expiresAt };
  return templates;
}

/**
 * Thin projection over `fetchAllTemplates` returning only the fields the
 * business classifier needs. Inherits the throw-on-failure behaviour of
 * `fetchAllTemplates`.
 */
export async function getTemplateCategories(): Promise<
  { id: string; display_name: string; match_keywords: string[] }[]
> {
  const templates = await fetchAllTemplates();
  return templates.map((template) => ({
    id: template.id,
    display_name: template.display_name,
    match_keywords: template.match_keywords,
  }));
}

/**
 * Drops both caches. Use in tests, or to force a refresh after an admin edits
 * a template.
 */
export function clearTemplateCache(): void {
  templateCache.clear();
  allTemplatesCache = null;
}
