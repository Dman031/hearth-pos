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
