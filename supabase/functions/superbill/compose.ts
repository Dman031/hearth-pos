// supabase/functions/superbill/compose.ts
//
// PURE. Rows in, document model + snapshot out. No I/O, no Deno APIs, no
// database client — which is what lets scripts/verify-superbill.mjs (in
// hearth-network, under Node) exercise the SHIPPED assembly rather than a
// re-description of it.
//
// ─── THE TWO PROVENANCE CLASSES ARE DECIDED HERE, NOT IN THE RENDERER ──────
// The renderer draws whatever it is handed; this module decides which class each
// fact belongs to, because that is a truth question rather than a layout one.
//
//   VERIFIED BY THE NETWORK   provider name + honorific, NPI, licence, the
//                             amount, the date it settled, the date of service
//   PROVIDED BY THE CLINICIAN patient name, date of birth, CPT, ICD, duration,
//                             new/follow-up
//
// THE AMOUNT SITS WITH THE STAMPS and that is not a technicality: the network
// processed the charge and holds the row. Putting it with the clinician's
// assertions would understate what this document can vouch for; putting a
// clinician-typed code with the stamps would overstate it. Ruling S8-7.
//
// ─── THE SNAPSHOT IS WHAT REACHED THE PAGE ─────────────────────────────────
// Ruling S8-5: `snapshot` is built HERE, from the same values the renderer draws,
// and is passed to issue_superbill (0042) alongside the file. It is deliberately
// not reassembled in SQL — a snapshot rebuilt elsewhere could silently disagree
// with the PDF it claims to describe. Live `verifications` rows are read ONCE,
// at issue; a licence voided next month never reaches this function again,
// because issuing is once-only.

import {
  LABELS,
  MODALITY_LABELS,
  SECTION_CLINICIAN,
  SECTION_CODES,
  SECTION_VERIFIED,
  SECTION_VISIT,
  SOURCE_LABELS,
  VISIT_KIND_LABELS,
  verifiedWith,
} from './copy.ts';

// ── inputs: exactly the rows the function fetched, nothing derived ──────────

export interface ComposeInput {
  engagementId: string;
  /** entities.display_name for the seller. The network holds no legal name. */
  providerName: string | null;
  /** 'doctoral' entitles "Dr."; anything else (including null) does not. */
  providerCredentialClass: string | null;
  /** LIVE verified rows only — status='verified' and voided_at is null. */
  verifications: {
    type: string;
    registry_ref: string | null;
    checked_at: string | null;
  }[];
  /** The wrap record. Everything on it is the clinician's assertion. */
  wrap: {
    visit_kind: string | null;
    cpt_code: string | null;
    icd_codes: string[] | null;
    duration_minutes: number | null;
    patient_name_for_billing: string | null;
    patient_dob: string | null;
  };
  /** The engagement's booked instant, and the slot's modality where there is one. */
  scheduledFor: string | null;
  modality: string | null;
  /** The succeeded charge. S8-4 refuses before we get here if there is none. */
  payment: { amount_cents: number; currency: string; settled_at: string };
  /** Rendered dates, computed by the caller — see the note on time below. */
  dates: {
    issued: string;
    dateOfService: string | null;
    paidOn: string;
    /** Keyed by verification type: a rendered checked-on date. */
    checkedOn: Record<string, string>;
  };
}

/** One printed line. `note` is the verified-with suffix; only verified lines have one. */
export interface DocLine {
  label: string;
  value: string;
  note?: string;
}

export interface DocSection {
  heading: string;
  /** The hairline rule is the first provenance device, and only the network block gets it. */
  ruled: boolean;
  lines: DocLine[];
}

export interface ComposedDoc {
  sections: DocSection[];
  snapshot: Record<string, unknown>;
}

/** Money, printed. Minor units are never shown to a person as a bare integer. */
export function formatAmount(cents: number, currency: string): string {
  const major = (cents / 100).toFixed(2);
  return currency.toLowerCase() === 'usd' ? `$${major}` : `${major} ${currency.toUpperCase()}`;
}

/** "Dr." only where the primary source showed a doctoral credential (0036 §2). */
export function providerLine(name: string | null, credentialClass: string | null): string {
  const shown = name && name.trim().length > 0 ? name.trim() : 'Provider';
  return credentialClass === 'doctoral' ? `Dr. ${shown}` : shown;
}

/**
 * TIME. Every instant reaching this module is a UTC ISO-8601 string, and every
 * date it prints was rendered by the caller and handed in through `dates`. A PDF
 * has no reader whose zone we know, so the function renders in UTC and labels it
 * — the DATE/TIME rule's "presentation is the client's job" has no client here,
 * so the honest move is to state the zone rather than guess one.
 */
export function compose(input: ComposeInput): ComposedDoc {
  const npi = input.verifications.find((v) => v.type === 'npi') ?? null;
  const licence = input.verifications.find((v) => v.type === 'license') ?? null;

  // ── VERIFIED BY THE NETWORK ──────────────────────────────────────────────
  const verified: DocLine[] = [
    {
      label: LABELS.provider,
      value: providerLine(input.providerName, input.providerCredentialClass),
    },
  ];
  if (npi?.registry_ref) {
    verified.push({
      label: LABELS.npi,
      value: npi.registry_ref,
      note: input.dates.checkedOn.npi
        ? verifiedWith(SOURCE_LABELS.npi, input.dates.checkedOn.npi)
        : undefined,
    });
  }
  if (licence?.registry_ref) {
    // registry_ref is '<ST>:<board>:<NUMBER>'. Only the NUMBER and the state are
    // printed: the board's internal slug is protocol-ish, and the user-facing
    // name of the source is already in the suffix ("the issuing licensing board").
    const parts = licence.registry_ref.split(':');
    verified.push({
      label: LABELS.licence,
      value: parts.length === 3 ? `${parts[2]} (${parts[0]})` : licence.registry_ref,
      note: input.dates.checkedOn.license
        ? verifiedWith(SOURCE_LABELS.license, input.dates.checkedOn.license)
        : undefined,
    });
  }
  verified.push({
    label: LABELS.amount,
    value: formatAmount(input.payment.amount_cents, input.payment.currency),
  });
  verified.push({ label: LABELS.paidOn, value: input.dates.paidOn });
  if (input.dates.dateOfService) {
    verified.push({ label: LABELS.dateOfService, value: input.dates.dateOfService });
  }

  // ── PROVIDED BY THE CLINICIAN ────────────────────────────────────────────
  // NO `note` ON ANY LINE BELOW, and the absence is the point: the
  // verified-with suffix appears only where something was actually verified.
  const clinician: DocLine[] = [];
  if (input.wrap.patient_name_for_billing) {
    clinician.push({ label: LABELS.patient, value: input.wrap.patient_name_for_billing });
  }
  if (input.wrap.patient_dob) {
    clinician.push({ label: LABELS.dob, value: input.wrap.patient_dob });
  }

  const visit: DocLine[] = [];
  if (input.modality && MODALITY_LABELS[input.modality]) {
    visit.push({ label: LABELS.modality, value: MODALITY_LABELS[input.modality] });
  }
  if (input.wrap.visit_kind && VISIT_KIND_LABELS[input.wrap.visit_kind]) {
    visit.push({ label: LABELS.visitKind, value: VISIT_KIND_LABELS[input.wrap.visit_kind] });
  }
  if (typeof input.wrap.duration_minutes === 'number') {
    visit.push({ label: LABELS.duration, value: `${input.wrap.duration_minutes} minutes` });
  }

  const codes: DocLine[] = [];
  if (input.wrap.cpt_code) codes.push({ label: LABELS.cpt, value: input.wrap.cpt_code });
  if (input.wrap.icd_codes && input.wrap.icd_codes.length > 0) {
    // The clinician's order and spelling, unchanged. Nothing here validates,
    // reorders or dedups a code (ruling S7-9).
    codes.push({ label: LABELS.icd, value: input.wrap.icd_codes.join(', ') });
  }

  const sections: DocSection[] = [
    { heading: SECTION_VERIFIED, ruled: true, lines: verified },
    { heading: SECTION_CLINICIAN, ruled: false, lines: clinician },
    { heading: SECTION_VISIT, ruled: false, lines: visit },
    { heading: SECTION_CODES, ruled: false, lines: codes },
  ].filter((s) => s.lines.length > 0);

  // The frozen record. It carries the RENDERED strings as well as the raw
  // values, because "what was printed" is the question it exists to answer.
  const snapshot: Record<string, unknown> = {
    version: 1,
    engagement_id: input.engagementId,
    issued: input.dates.issued,
    provider: {
      name: providerLine(input.providerName, input.providerCredentialClass),
      credential_class: input.providerCredentialClass,
    },
    stamps: input.verifications.map((v) => ({
      type: v.type,
      registry_ref: v.registry_ref,
      checked_at: v.checked_at,
    })),
    clinician_asserted: {
      patient_name: input.wrap.patient_name_for_billing,
      patient_dob: input.wrap.patient_dob,
      cpt_code: input.wrap.cpt_code,
      icd_codes: input.wrap.icd_codes,
      duration_minutes: input.wrap.duration_minutes,
      visit_kind: input.wrap.visit_kind,
    },
    visit: { scheduled_for: input.scheduledFor, modality: input.modality },
    payment: {
      amount_cents: input.payment.amount_cents,
      currency: input.payment.currency,
      settled_at: input.payment.settled_at,
    },
    printed: sections,
  };

  return { sections, snapshot };
}
