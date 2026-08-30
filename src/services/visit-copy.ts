// src/services/visit-copy.ts
//
// PLEXMED S7's approved strings, transcribed once.
//
// The source of these is hearth-network src/capabilities/card-copy.ts; the spec
// is how they travel. They are copied rather than imported because the two
// repos share no build. A change there is a change here, and neither is a place
// to improvise: copy is approved as written and a screen may not paraphrase it.

export const VISIT_STATE_LABELS = {
  scheduled: 'Scheduled',
  in_visit: 'In the visit',
  wrapped: 'Wrapped',
  cancelled: 'Cancelled',
} as const;

// The room row. BOTH STATES RENDER, for the reason the identity chip renders in
// both on Incoming: an absent row and an absent room must not look alike on a
// clinical surface. "No room yet" is equally true before T-60 and when the
// vendor is unprovisioned — from the clinician's side those are the same fact,
// and the copy does not leak which.
export const VISIT_ROOM_READY = 'Room ready';
export const VISIT_ROOM_PENDING = 'No room yet';
export const VISIT_ROOM_PENDING_BODY =
  'The room opens an hour before the visit. Both of you get the same link here in the ' +
  'conversation when it does.';
export const VISIT_ROOM_READY_BODY =
  'Opening the link starts the visit in your browser. Nothing is recorded.';

// Network-scoped and says so. "New patient" appears NOWHERE on Today — it is a
// billing distinction, and it lives in exactly one place: the clinician's own
// pick at wrap.
export const CHIP_FIRST_VISIT = {
  label: 'First visit on this network',
  expanded:
    'You have not completed a visit with this person here before. That is a fact about this ' +
    'network, not about their care — they may have been seen anywhere.',
} as const;

export const WRAP_HEADER = 'Wrap the visit';
export const PLAN_HEADER = 'The plan';
export const PLAN_SHARED_NOTE =
  'Both of you see this in the conversation, and either of you can check things off.';
export const PLAN_EMPTY = 'No plan yet';
export const PLAN_MAX_ITEMS = 20;
export const PLAN_TOO_MANY = 'A plan holds up to 20 things. Trim it and it will send.';

/** "2 of 5 done" — composed, never a bare fraction. */
export function planProgress(done: number, total: number): string {
  return `${done} of ${total} done`;
}

// The one place in the product where these words appear at all. The clinician
// picks; nothing else may.
export const VISIT_KIND_LABELS = { new: 'New patient', follow_up: 'Follow-up' } as const;

/**
 * ⚑ THE CPT SHORT LIST — RENDER IN THIS ORDER, PRESELECT NOTHING, NEVER REORDER.
 *
 * Ruling S7-6 makes this a STATIC REVIEWED CONSTANT: nothing generates it,
 * nothing ranks it, and no signal from the visit reorders it. A short list a
 * person scrolls is the only shape that is not a suggestion.
 *
 * IT IS NOT EXHAUSTIVE AND MUST NOT PRETEND TO BE. PAIRED WITH THE SUPERBILL
 * TEMPLATE ON COUNSEL REVIEW: the two go to counsel together and neither
 * reaches anyone outside the TEST COHORT until that review returns.
 */
export const CPT_SHORT_LIST: readonly { code: string; label: string }[] = [
  { code: '99202', label: 'New patient · straightforward' },
  { code: '99203', label: 'New patient · low complexity' },
  { code: '99204', label: 'New patient · moderate complexity' },
  { code: '99205', label: 'New patient · high complexity' },
  { code: '99212', label: 'Established · straightforward' },
  { code: '99213', label: 'Established · low complexity' },
  { code: '99214', label: 'Established · moderate complexity' },
  { code: '99215', label: 'Established · high complexity' },
  { code: '90791', label: 'Psychiatric diagnostic evaluation' },
  { code: '90832', label: 'Psychotherapy · 30 minutes' },
  { code: '90834', label: 'Psychotherapy · 45 minutes' },
  { code: '90837', label: 'Psychotherapy · 60 minutes' },
];

// FREE TEXT, and the helper says why rather than apologising for it (S7-9). No
// lookup, no autocomplete, no list — any list we authored would be a suggestion
// wearing a different hat.
export const ICD_HEADER = 'Diagnosis codes';
export const ICD_HELP = 'Type the codes you are using. Nothing here suggests or checks them.';

export const CADENCE_HEADER = 'Check back in';
export const CADENCE_HELP =
  'We will put this conversation on your list after that many days. Nothing is sent until ' +
  'you write it and tap send.';
export const CADENCE_NONE = 'No reminder';
export const FOLLOWUPS_DUE_HEADER = 'Ready to check in on';

// The clinician OFFERS a time; the patient takes it. "Book a follow-up" would
// describe something the clinician cannot do — minting a request from the
// patient would fabricate their consent.
export const FOLLOW_UP_HEADER = 'Offer another time';
export const FOLLOW_UP_HELP =
  'This puts the time on your board and tells them it is there. They choose whether to take ' +
  'it, the same as the first visit.';

// The billing block. That sentence is the whole ruling in one place: the stamps
// are the network's claim; the name and DOB are the clinician's.
export const BILLING_HEADER = 'For the superbill';
export const BILLING_HELP =
  'The name and date of birth their insurer holds. We do not have either one — you are the ' +
  'one telling us, and nothing on the network checks it.';

/** Renders on EVERY wrap. A promise that renders sometimes is not a promise. */
export const WRAP_FOOTER =
  'Nothing here was recorded, transcribed, or written for you. What you type is the whole ' +
  'record, and the codes are the ones you picked.';

// ─── PLEXMED S10 · THE PUSH AND THE SUPERBILL ───────────────────────────────
//
// FOUR OF THESE ARE APPROVED VERBATIM in hearth-network
// docs/PLEXMED_S10_FHIR_PUSH_SPEC.md §4 (sent · pushed_at; sent + omission;
// skipped/no_modality; pending with attempts). The remaining nine were drafted
// in the S10 tap investigation and RATIFIED 2026-08-30, with one amendment
// carried out here: the no_practitioner_identifier line is in the clinician's
// own words and POINTS AT THE CREDENTIAL SURFACE, because it is the one skip
// they can fix.
//
// EVERYTHING ELSE IN THIS SECTION IS ALSO RATIFIED (2026-08-30): the button
// labels, the alert strings and the toasts, as written. NOTHING BELOW IS
// PROVISIONAL — including the sent+omission hint, whose ratified wording said
// "then send it again" and was changed here because 0045:254-259 makes a 'sent'
// row a no-op, so the approved line instructed a clinician to do something the
// code refuses. Ratified copy that promises an action the code declines is a
// defect in the copy; the change was signed off on that reasoning. Same rule as
// the rest of this file: approved as written, and a screen may not paraphrase.
//
// AN OMISSION IS NOT A SKIP (S10-9; 0045:144-147). `superbill_object_missing`
// and `superbill_lookup_failed` ride on a row whose status is 'sent' — the
// record moved and one part of it did not. Rendering either as "Not sent"
// would tell a clinician their record never went when it did. That asymmetry
// is why the copy below is a function and not a lookup table.
//
// THE SEVEN SKIPS ARE ALL RENDERED. hearth-network writes seven skipped_reason
// values (push.ts:272,273,286 and compose.ts:148-151), not the four the S10 tap
// prompt named. A reason with no copy would render as a bare "Not sent", which
// is the silent failure this whole surface exists to prevent.

/** Mirrors PUSH_MAX_ATTEMPTS (hearth-network src/fhir/push.ts:55). */
export const PUSH_MAX_ATTEMPTS = 5;

/** The tap. Reads as the far side of the spec's own "Sent to your record". */
export const PUSH_ACTION = 'Send to your record';
/** 0045:254-259 — a sent row is a DELIBERATE no-op. The label must say so. */
export const PUSH_ACTION_SENT = 'Already sent';
export const PUSH_ACTION_RETRY = 'Send it again';
export const PUSH_QUEUED = 'Queued. It sends on the next round.';

/** Where the one fixable skip points. Same pointing shape as WrapSheet's C5. */
export const PUSH_NPI_POINTER = 'Verify your license in your account, under Verify my license.';

export interface PushStatusLine {
  /** The status row itself. */
  line: string;
  /** A second line where there is something to DO, or null. */
  hint: string | null;
  /** True when tapping re-queues the row (0045:245-253 resets failed/skipped). */
  retryable: boolean;
  /** True when the row is terminal-and-fine — the tap is a no-op (0045:254-259). */
  settled: boolean;
}

/** The omission values hearth-network can write (push.ts:210,225,230). */
const DOCUMENT_OMISSIONS = ['superbill_object_missing', 'superbill_lookup_failed'];

/**
 * One push row, as a clinician reads it.
 *
 * `pushedAtLabel` is pre-formatted BY THE CALLER through src/datetime.ts — the
 * DATE/TIME DISPLAY RULE forbids formatting at a display site, and this module
 * holds no timezone. Null renders the line without a time rather than with a
 * guess.
 */
export function pushStatusCopy(
  status: string,
  opts: {
    attempts: number;
    skippedReason: string | null;
    omissions: string[] | null;
    lastError: string | null;
    pushedAtLabel: string | null;
  },
): PushStatusLine {
  if (status === 'sent') {
    // APPROVED (spec §4). The omission wins the line: a clinician who is owed
    // a document must learn it did not go before they learn when it went.
    const droppedDocument = (opts.omissions ?? []).some((o) => DOCUMENT_OMISSIONS.includes(o));
    if (droppedDocument) {
      // THE HINT MUST NOT PROMISE A SECOND SEND. 0045:254-259 makes a 'sent'
      // row a deliberate no-op, so "send it again" would be an instruction the
      // code refuses to carry out. S10-14 names the honest alternative: the
      // superbill PDF is the fallback and the universal answer.
      return {
        line: 'Sent to your record · the superbill did not go',
        hint: 'Make the superbill and hand it over directly — it can’t be attached to this one.',
        retryable: false,
        settled: true,
      };
    }
    return {
      line: opts.pushedAtLabel
        ? `Sent to your record · ${opts.pushedAtLabel}`
        : 'Sent to your record',
      hint: null,
      retryable: false,
      settled: true,
    };
  }

  if (status === 'sending') {
    return { line: 'Sending now', hint: null, retryable: false, settled: false };
  }

  if (status === 'pending') {
    // APPROVED (spec §4) on the retry branch. Attempt zero is NOT "trying
    // again" — nothing has been tried, and the word would be a small lie on
    // the most common state this surface has.
    return opts.attempts > 0
      ? {
          line: `Trying again · ${opts.attempts} of ${PUSH_MAX_ATTEMPTS}`,
          hint: null,
          retryable: false,
          settled: false,
        }
      : { line: 'Waiting to send', hint: null, retryable: false, settled: false };
  }

  if (status === 'failed') {
    // last_error is the target server's own text, capped at 400 and scrubbed by
    // the adapter (0045:285-288, medplum.ts:28-32). It is safe to show and it
    // is the only thing that tells a clinician WHY.
    return {
      line: opts.lastError ? `Not sent · ${opts.lastError}` : 'Not sent',
      hint: 'Tap to try again.',
      retryable: true,
      settled: false,
    };
  }

  if (status === 'skipped') {
    return { ...skippedCopy(opts.skippedReason), retryable: true, settled: false };
  }

  // ABSENCE OF EVIDENCE IS REPORTED AS FAILURE. An unknown status is a schema
  // change this app has not caught up with — it must not render as blank.
  return { line: 'Not sent', hint: 'Tap to try again.', retryable: true, settled: false };
}

/** The seven refusals, by name. Each says what happened; two say what to do. */
function skippedCopy(reason: string | null): { line: string; hint: string | null } {
  switch (reason) {
    // APPROVED VERBATIM (spec §4).
    case 'no_modality':
      return {
        line: 'Not sent · No open time was bound to this visit, so we could not say how it happened.',
        hint: null,
      };
    // RATIFIED 2026-08-30, amended: the clinician's own words, and a pointer.
    // The ONE skip with a fix they own (S10-18(a)).
    case 'no_practitioner_identifier':
      return {
        line: 'Not sent · Your NPI isn’t verified, so nothing can be filed under your name.',
        hint: PUSH_NPI_POINTER,
      };
    case 'no_patient_identifier':
      return {
        line: 'Not sent · This patient has no network ID, so we could not match them in your record.',
        hint: null,
      };
    // S10-7 rejected truncation outright — silent data loss in a clinical
    // record. The copy ASKS; it never trims.
    case 'too_many_conditions':
      return {
        line: 'Not sent · This visit has more diagnosis codes than the record accepts.',
        hint: 'Trim the list and send it again.',
      };
    case 'cancelled_before_push':
      return { line: 'Not sent · This visit was cancelled.', hint: null };
    case 'not_wrapped':
    case 'engagement_missing':
      return { line: 'Not sent · The visit record is no longer there.', hint: null };
    default:
      // A named reason with no copy here is a vocabulary change upstream. Say
      // the true half rather than nothing, and never invent the other half.
      return { line: 'Not sent', hint: 'Tap to try again.' };
  }
}

// ─── THE SUPERBILL AFFORDANCE ───────────────────────────────────────────────
// The label is NEUTRAL because the app cannot know whether one exists:
// public.superbills is RLS-on with zero policies and revoked grants (0041), so
// no client can read it (0042:137-138). The app learns a superbill exists from
// the THREAD MESSAGE, not from a query. Issue-once (S8-3) makes the neutral
// label honest — a second tap returns the same receipt with a fresh link, and
// the alert says which of the two just happened.
export const SUPERBILL_ACTION = 'Superbill';
export const SUPERBILL_READY = 'Your superbill is ready';
export const SUPERBILL_ALREADY = 'This superbill was already issued';
export const SUPERBILL_BODY =
  'It is in your conversation with this patient. It is a statement for insurance ' +
  'reimbursement — not a bill, and not a claim.';
export const SUPERBILL_OPEN = 'Open it';
export const SUPERBILL_OPEN_FAILED = 'Couldn’t open the superbill from here.';
export const SUPERBILL_LINK_FAILED =
  'Couldn’t get a link to that file just now. Nothing was changed — try again.';
