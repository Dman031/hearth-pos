// supabase/functions/superbill/copy.ts
//
// The superbill's approved copy. APPROVED VERBATIM 2026-08-26 — ruling S8-7,
// DEUS_DAY_BY_DAY.md "RULINGS — 2026-08-26". A renderer may not paraphrase it.
//
// WHY THE COPY LIVES HERE AND NOT IN card-copy.ts. Every other reviewed string
// in this product is a constant in hearth-network/src/capabilities/card-copy.ts,
// and a screen receives it through a spec document. This renderer is a Deno edge
// function in hearth-pos and CANNOT import that module, so S8-7 made the ROADMAP
// the source of record and this file the transcription. If the two ever
// disagree, the roadmap is right and this file is the bug.
//
// The footer's last clinician sentence — "The clinician is responsible for their
// accuracy." — is Derrick's addition and is the reason the paragraph works:
// without it the footer says only what the network did NOT do; with it, the
// document says who stands behind what it asserts.

/** Line 1 of the page. */
export const TITLE = 'SUPERBILL';

/** Lines 2–3, under the title. `issued` is a rendered date, never a relative word. */
export function headerLines(issued: string): string[] {
  return [
    'A statement of services for insurance reimbursement.',
    `Issued ${issued} · not a claim, and not a bill.`,
  ];
}

/** The two provenance section headers. ALL-CAPS is one of the three devices. */
export const SECTION_VERIFIED = 'VERIFIED BY THE NETWORK';
export const SECTION_CLINICIAN = 'PROVIDED BY THE CLINICIAN';

/** Sub-headers inside the body. */
export const SECTION_VISIT = 'THE VISIT';
export const SECTION_CODES = 'CODES';

/**
 * The footer, verbatim. Two paragraphs, rendered as two wrapped blocks.
 * The first sentence is S8-2 in a form a claims adjudicator can act on.
 */
export const FOOTER_PARAGRAPHS: readonly string[] = [
  // DOUBLE-QUOTED so the apostrophes stay STRAIGHT, exactly as the roadmap has
  // them. Verbatim means verbatim, down to the punctuation — a typographic
  // apostrophe here would be a silent edit to approved copy.
  "Where each fact on this page comes from. The provider's name, licence and NPI were " +
    'confirmed with the issuing registries on the dates shown, and the amount was recorded ' +
    "when it was paid — those are the network's statements. The patient's name " +
    'and date of birth, the codes, and the visit length were entered by the clinician; the ' +
    'network holds no patient identity and checked none of them. The clinician is responsible ' +
    'for their accuracy.',
  'This is not a medical record and not an insurance claim. Nothing about this visit was ' +
    'recorded or transcribed.',
];

/** Field labels. Plain words; no protocol language reaches a printed page. */
export const LABELS = {
  provider: 'Provider',
  npi: 'NPI',
  licence: 'Licence',
  patient: 'Patient',
  dob: 'Date of birth',
  dateOfService: 'Date of service',
  duration: 'Duration',
  modality: 'Visit type',
  visitKind: 'Visit',
  cpt: 'Service (CPT)',
  icd: 'Diagnosis (ICD)',
  amount: 'Amount paid',
  paidOn: 'Paid on',
} as const;

/**
 * The suffix that marks a fact as the NETWORK'S statement. It appears ONLY on
 * verified lines — that asymmetry is the third provenance device, after the
 * hairline rule and the ALL-CAPS section headers.
 */
export function verifiedWith(source: string, checkedOn: string): string {
  return `— verified with ${source} on ${checkedOn}`;
}

/** How a source reads to a person. Never a vendor name, never a board's initials. */
export const SOURCE_LABELS: Record<string, string> = {
  npi: 'the national provider registry',
  license: 'the issuing licensing board',
};

/** Modality, printed. Mirrors card-copy.ts MODALITY_CHIP. */
export const MODALITY_LABELS: Record<string, string> = {
  video: 'Video visit',
  in_person: 'In person',
};

/** Visit kind, printed. The clinician's pick and the only place these words appear. */
export const VISIT_KIND_LABELS: Record<string, string> = {
  new: 'New patient',
  follow_up: 'Follow-up',
};

/** Refusals, by name — each says what to do instead. */
export const REFUSALS = {
  notSeller: 'only the clinician who provided the visit can issue its superbill',
  notWrapped: 'this visit has not been wrapped yet, so it has no codes to bill',
  notPaid:
    'no payment has settled for this visit, so there is nothing to reimburse. A superbill ' +
    'states an amount that was paid; a visit with no payment needs a visit summary instead',
  noEngagement: 'that visit could not be found',
} as const;
