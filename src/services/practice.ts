// src/services/practice.ts
//
// The practice card's field vocabulary.
//
// THESE LABELS ARE A CONTRACT, NOT A STYLE CHOICE. The network's chip and
// embedding pipeline reads these EXACT lower-cased strings off a practice
// card's `fields` (PLEXMED_S5_PRACTICE_AUTHORING_SPEC.md note 7). A typo here
// does not throw — it silently drops the field out of retrieval, which is the
// expensive kind of wrong. They live in one place so no call site can spell one
// differently.
//
// TWO OF THE SEVEN CANONICAL LABELS ARE DELIBERATELY ABSENT: `specialty` and
// `new clients`. Neither has ruled copy anywhere in the spec, and both feed
// retrieval — inventing an input label for them would get a clinician retrieved
// on words nobody approved. `specialty` in particular is the field SYMPTOM_RULE
// and ROUTING_RULE govern, so it earns its own ruling rather than a text box.
// Logged as an open spec gap in hearth-network DEFERRED.md, trigger "before the
// Portland seed". Do NOT add them here to "complete the set".
//
// AND ONE LABEL FAMILY IS FORBIDDEN: `availability` / `hours` / `when` / `open`.
// The network IGNORES those on a practice card — the open-times board IS the
// availability, and a typed one cannot outrank it. The practice editor must
// never offer such a field, because an editor that accepts one lets a clinician
// believe something the system will not honour.

import type { FieldEntry } from '../utils/card-fields';

/** The canonical labels this app writes. Lower-cased, exactly as the network reads them. */
export const PRACTICE_FIELD = {
  description: 'description',
  modality: 'modality',
  sessionLength: 'session length',
  licensedStates: 'licensed states',
  slidingScale: 'sliding scale',
} as const;

/** Labels the network ignores on a practice card — never offer an input for these. */
export const FORBIDDEN_PRACTICE_LABELS: readonly string[] = [
  'availability',
  'hours',
  'when',
  'open',
];

export type Modality = 'video' | 'in_person';

/** How a modality is written on the card and spoken in the UI. */
export const MODALITY_LABEL: Record<Modality, string> = {
  video: 'Video',
  in_person: 'In person',
};

/** The session lengths the spec's segmented control offers, in minutes. */
export const SESSION_LENGTHS = [30, 45, 50, 60] as const;

/** Two-letter state → the name a person reads. Only the states whose boards the
 *  ceremony can reach today; an unknown code renders as itself rather than as a
 *  guess. */
const STATE_NAME: Record<string, string> = { OR: 'Oregon' };

export function stateName(code: string): string {
  return STATE_NAME[code] ?? code;
}

export interface PracticeDraft {
  description: string;
  modalities: Modality[];
  sessionMinutes: number;
  /** Two-letter codes, derived from verified licences — never typed. */
  licensedStates: string[];
  slidingScale: boolean;
}

/**
 * Builds the practice card's `fields` array under the canonical labels.
 *
 * OMISSION IS MEANINGFUL HERE. A field the clinician did not fill is left OUT,
 * never written as an empty string or as "No": an absent `sliding scale` says
 * nothing, while `sliding scale: "No"` is a claim that enters retrieval. Same
 * reasoning as the no-placeholder-data rule.
 */
export function buildPracticeFields(draft: PracticeDraft): FieldEntry[] {
  const fields: FieldEntry[] = [];

  const description = draft.description.trim();
  if (description.length > 0) {
    fields.push({ label: PRACTICE_FIELD.description, value: description });
  }
  if (draft.modalities.length > 0) {
    fields.push({
      label: PRACTICE_FIELD.modality,
      value: draft.modalities.map((m) => MODALITY_LABEL[m]).join(', '),
    });
  }
  fields.push({
    label: PRACTICE_FIELD.sessionLength,
    value: `${draft.sessionMinutes} min`,
  });
  if (draft.licensedStates.length > 0) {
    fields.push({
      label: PRACTICE_FIELD.licensedStates,
      value: draft.licensedStates.map(stateName).join(', '),
    });
  }
  // Only when true. See the omission note above.
  if (draft.slidingScale) {
    fields.push({ label: PRACTICE_FIELD.slidingScale, value: 'Yes' });
  }

  return fields;
}

/** Reads a practice card's fields back into a draft, for the edit path. */
export function readPracticeFields(entries: FieldEntry[]): Partial<PracticeDraft> {
  const byLabel = new Map(entries.map((e) => [e.label.trim().toLowerCase(), e.value]));
  const modalityRaw = byLabel.get(PRACTICE_FIELD.modality) ?? '';
  const modalities: Modality[] = [];
  if (modalityRaw.includes(MODALITY_LABEL.video)) modalities.push('video');
  if (modalityRaw.includes(MODALITY_LABEL.in_person)) modalities.push('in_person');

  const lengthRaw = byLabel.get(PRACTICE_FIELD.sessionLength) ?? '';
  const parsedLength = Number.parseInt(lengthRaw, 10);

  return {
    description: byLabel.get(PRACTICE_FIELD.description) ?? '',
    modalities: modalities.length > 0 ? modalities : undefined,
    sessionMinutes: Number.isFinite(parsedLength) ? parsedLength : undefined,
    slidingScale: byLabel.has(PRACTICE_FIELD.slidingScale),
  };
}
