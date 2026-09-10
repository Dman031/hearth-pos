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
import type { InboundKind, InboundStatus } from '../types/inbound';

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

// ─── THE HOLD, AND WHAT HAPPENS WHEN IT RUNS OUT (PLEXMED S5 S4b / S6 T4) ────
//
// A BOOKING holds a time. When the hold lapses the time goes back on the board
// and the request stays — the conversation outlives the hold, which is a real
// state and not an edge case. `get_my_pending_requests` reports a lapsed hold
// as a NULL `held_until` (0040 — "Live holds only: a lapsed hold reports null,
// which is the same thing the claim predicate believes"), and this is the one
// place that null is turned into a display state.
//
// ── THE HOLD IS FIVE MINUTES NOW, NOT A DAY (N-20). CORRECTED IN PLACE. ──────
// This block used to open "A request holds a time", and the banner below used
// to say a request holds it "for a day, or until an hour before the visit".
// That described VL-1's DECISION window, and N-20 removed the decision. The
// live claim_slot_and_knock body is unambiguous, and says so itself at its
// lines 70-74:
//     -- N-20 hold-bridge step 1: 5 minutes, sized for a Stripe round trip.
//     -- VL-1's 24h window was a DECISION window and there is no decision
//     -- left to make; the `starts_at - 60 min` arm is VL-2 and is retained.
//     held_until = least(now() + interval '5 minutes',
//                        s.starts_at - interval '60 minutes'),
// So the two arms are 5 MINUTES and AN HOUR BEFORE THE VISIT. The second half
// of the old sentence was always true and is kept; the first half is corrected
// rather than softened.
//
// IT IS NEVER AN ERROR STATE. The clinician did nothing wrong and neither did
// the person who asked. Never say "expired" about a person's request, and never
// imply they gave up: they asked, the clock ran, that is all that happened.

/**
 * Has this request's held time gone back on the board?
 *
 * ── THE KIND CHECK IS NEW, AND IT CLOSES A REAL DEFECT (BUG-013) ────────────
 * `held_until` is null for a THIRD reason this predicate did not account for:
 * a PRACTICE REACH — the ask-first knock, which never claims a slot at all.
 * reach_entity keeps 'reach' open on a practice card by ruling ("A visit is
 * booked, never ordered. 'reach' stays open — asking a clinician a question
 * before booking is the whole point of Ask-first, and it claims nothing",
 * reach-entity.ts:393-395), and only claim_slot_and_knock takes a hold — which
 * always mints kind='booking' (live body :59). So every practice reach reported
 * a null held_until, satisfied `isPracticeRequest`, and rendered "That time was
 * let go" about a request that never asked for a time — AND LOST ITS ACCEPT
 * CONTROL, because T4 removes Accept on a let-go row.
 *
 * ONLY A BOOKING CAN HAVE LET A TIME GO, so kind is the check that was missing.
 *
 * THE PRACTICE GATE IS A CHECK, NOT A COMMENT, AND IT IS THE FIRST LINE.
 * `held_until` is null for TWO further reasons — a practice hold that lapsed,
 * and an ordinary booking or order that never had a hold at all. Deriving
 * let-go from the null ALONE would make every non-practice pending row read as
 * let-go, and T4 REMOVES Accept on a let-go row, so an ordinary booking would
 * silently lose the only control that can act on it.
 *
 * That is why this returns false for a non-practice request before it looks at
 * anything else, and why both surfaces call this rather than each writing the
 * predicate. There is exactly one derivation of this state in the app.
 */
export function isTimeLetGo(input: {
  /** The request's card is a practice card. FALSE can never yield let-go. */
  isPracticeRequest: boolean;
  /** The knock's kind. Only 'booking' ever holds a time — see the note above. */
  kind: InboundKind;
  /** The get_my_pending_requests row, or null when the read failed/not loaded. */
  pending: { held_until: string | null } | null;
}): boolean {
  if (!input.isPracticeRequest) return false;
  if (input.kind !== 'booking') return false;
  // A MISSING READ IS NOT A LAPSED HOLD. Null pending means we do not know —
  // and "we do not know" must not remove a control, which is the same reason
  // the chips are omitted rather than guessed when their read fails.
  if (input.pending === null) return false;
  return input.pending.held_until === null;
}

/** T4's banner. Shared so the two accept surfaces cannot drift apart. */
export const LET_GO_TITLE = 'That time was let go';
export const LET_GO_BODY =
  'Booking holds a time for five minutes while the payment goes through, and never past an ' +
  'hour before the visit. This one passed that point, so the time went back on your board. ' +
  'You can still talk here; to book, they need to ask for a time again.';

// ── WHAT THIS STATE IS NOW, STATED SO IT IS NOT RE-DERIVED FROM THE CODE ────
// With the kind check above and N-20-AMENDED-7 item 3's filter both in place,
// NOTHING THE APP RENDERS CAN REACH IT: the only knock that holds a time is a
// practice booking, and a PENDING practice booking is removed from every
// pending-inbound read. The state is unreachable by construction, not by
// accident, and both halves of that construction are deliberate.
//
// THE MACHINERY AND THE COPY STAY — the same reasoning as the N-19 retirement
// block further down this file. This copy was ratified, the reason each clause
// exists is the expensive part, and the banner becomes reachable again the
// moment anything gives a non-booking knock a hold or puts a pending booking
// back on a screen. What is NOT acceptable is a wired string that is false,
// which is why the sentence above was corrected rather than left to rot behind
// an unreachable branch.
//
// DO NOT DELETE IT AS DEAD CODE, and do not "simplify" the kind check away: it
// is what stops the ask-first flow — the clinical tile's whole purpose — from
// rendering a let-go banner it has no business showing.

/**
 * The race: the hold was live when the screen painted and gone when the finger
 * landed. Distinct from the banner above, which is the state BEFORE a tap.
 */
export const LET_GO_RACE =
  'That time went to someone else. They can ask for another; nothing was charged.';

/**
 * Is this refusal the lapsed/taken hold?
 *
 * MATCHED BY MESSAGE, NEVER BY THE ABSENCE OF SUCCESS. The raise is
 * `respond_to_inbound: that held time has lapsed or was taken (code:
 * SLOT_NO_LONGER_HELD)` (0038b:767). A bare `catch` that reports the race on
 * ANY failure tells a clinician on a dropped connection that their patient's
 * time went to someone else — a fallback string describing the opposite of what
 * happened, which is the VERIFICATION DISCIPLINE clause this very copy was
 * written about.
 */
export function isSlotNoLongerHeld(err: unknown): boolean {
  const message =
    typeof (err as { message?: unknown })?.message === 'string'
      ? String((err as { message: string }).message)
      : '';
  return /SLOT_NO_LONGER_HELD/.test(message);
}

// ─── THE TWO PERMANENT REFUSALS (N-20-AMENDED-7 items 2 and 3) ──────────────
//
// THESE ARE ADDITIONS. isSlotNoLongerHeld above is UNTOUCHED and still live —
// it fires on a non-practice slot accept, where the hold really can lapse.
//
// WHAT MAKES THEM DIFFERENT FROM EVERY OTHER FAILURE ON THESE SURFACES: they
// are PERMANENT. "Try again" is the correct advice for a dropped connection and
// the wrong advice for a decision the server will refuse every time, forever.
// Telling a clinician to retry something terminal is the same defect class the
// let-go race copy was written for — a fallback string describing the opposite
// of what happened — and it is why these two get their own arms rather than
// falling to the default.
//
// REACHABILITY, and it is narrow ON PURPOSE. N-20-AMENDED-7 item 3 removes
// these rows from every pending-inbound read, so a clinician reaches these
// refusals only in the race window: the row was on screen when
// confirm_slot_booking landed and the finger came down before the realtime
// stream cleared it. The filter is the fix; this is the belt.
//
// NOTE ALSO WHAT IS NOW UNREACHABLE ON A PRACTICE BOOKING. respond_to_inbound's
// practice-booking guard sits at live-body line 70, IN FRONT OF the
// SLOT_NO_LONGER_HELD raise at line 132 inside the same accept branch. So on a
// practice booking the lapsed-hold race can no longer be reached at all. Its
// arm stays because the code still fires elsewhere — deleting it would be
// removing a live answer to make a dead branch tidy.
//
// MATCHED BY MESSAGE, like every refusal in this file: the raises carry an
// explicit `(code: X)` suffix and a status alone is not an assertion.

/** Accept was refused: the patient already booked and paid this time. */
export function isSlotAlreadyConfirmed(err: unknown): boolean {
  const message =
    typeof (err as { message?: unknown })?.message === 'string'
      ? String((err as { message: string }).message)
      : '';
  return /SLOT_ALREADY_CONFIRMED/.test(message);
}

/** Pass/Decline was refused: posting the time was the yes. */
export function isSlotBookingNotDeclinable(err: unknown): boolean {
  const message =
    typeof (err as { message?: unknown })?.message === 'string'
      ? String((err as { message: string }).message)
      : '';
  return /SLOT_BOOKING_NOT_DECLINABLE/.test(message);
}

// THE TWO STRINGS SHARE THEIR FIRST CLAUSE DELIBERATELY. It is the same fact
// underneath both refusals — the time is booked and paid — and a clinician who
// meets one and then the other should recognise it, not read two unrelated
// explanations of one state. Each then says the thing its own control needs:
// where the visit went, or how to undo it.
//
// NEITHER SAYS "TRY AGAIN" AND NEITHER IMPLIES FAULT. Nothing went wrong. The
// patient booked a time the clinician had posted, which is the system working.

/** Accept, refused. */
export const ALREADY_CONFIRMED_MESSAGE =
  'That time is already booked and paid — posting it was the yes, so there is nothing to ' +
  'accept. The visit is in your day.';

/** Decline / Pass, refused. */
export const NOT_DECLINABLE_MESSAGE =
  'That time is already booked and paid — posting it was the yes, so it cannot be declined. ' +
  'To undo it, cancel the visit; the patient is refunded in full.';

// ─── THE BRIDGE STATE (N-20-AMENDED-7 item 3) ───────────────────────────────
//
// "A BRIDGE-STATE BOOKING IS INVISIBLE TO THE CLINICIAN. hearth-pos filters
// pending practice bookings out of Incoming and every pending-inbound read.
// Nothing to decide, nothing to show."
//
// WHY THERE IS NOTHING TO DECIDE, and it is not a matter of taste: BOTH
// decisions are refused server-side. respond_to_inbound's live body raises
// SLOT_ALREADY_CONFIRMED on the accept branch and SLOT_BOOKING_NOT_DECLINABLE
// on the pass branch, for exactly `card.kind = 'practice' and inbound.kind =
// 'booking'`. Posting the time was the yes; the booking confirms and charges
// when the patient books it. A row offering two controls that can only refuse
// is worse than no row.
//
// WHY `pending` IS THE BRIDGE AND NOT A LOOSER GUESS: confirm_slot_booking
// flips the row — `update public.inbound set status = 'accepted' where id =
// p_inbound_id and status = 'pending'` (live body, read 2026-09-10). So a
// practice booking that is STILL pending has not confirmed: it is inside the
// five-minute payment bridge, or the bridge failed and the Worker refunded.
// Either way there is no clinician decision in it.
//
// THE PREDICATE IS THE SERVER'S OWN, TERM FOR TERM. Same pair, same order, so
// the two cannot drift into disagreeing about which row is undecidable.
//
// ── ON THE UNLOADED-CARDS CASE, WHICH IS THE ONLY WAY THIS CAN BE WRONG ──
// With `cards` empty (still loading, or the read failed) no card resolves and
// this returns FALSE — the row is SHOWN. That is deliberate and it is the same
// answer InboundTile already gives: its `isClinical = card?.kind === 'practice'`
// (InboundTile.tsx:71) is likewise false until the cards land, so the tile
// renders as an ordinary booking in that window. Showing a row we cannot yet
// classify is recoverable; hiding one we cannot yet classify is not.
//
// IT IS ALSO WHY THE BADGE AND THE LIST CANNOT DISAGREE. Both call THIS
// function, over the SAME `cards` array from the one CardProvider, so they
// resolve every row identically — including during that window, where they are
// wrong together and correct together rather than drifting apart.

/**
 * Is this pending row a practice booking mid-bridge — i.e. a row the clinician
 * has no decision to make about, and which every pending-inbound read hides?
 *
 * `cards` is the recipient's OWN card list (CardProvider). The knock is
 * addressed to them, so its card is always one of theirs; a card_id that
 * resolves to nothing is a deleted card, and a deleted card is not a practice
 * card as far as this predicate is concerned.
 */
export function isBridgeStatePracticeBooking(
  inbound: { kind: InboundKind; status: InboundStatus; card_id: string | null },
  cards: readonly { id: string; kind: string }[],
): boolean {
  if (inbound.status !== 'pending') return false;
  if (inbound.kind !== 'booking') return false;
  if (inbound.card_id === null) return false;
  const card = cards.find((c) => c.id === inbound.card_id);
  return card?.kind === 'practice';
}

// ─── THE PRACTICE CARD'S PAUSED STATES (PLEXMED S5 P5) ──────────────────────
//
// "Paused" means NOBODY CAN ASK — not that nobody has an opening left. A card
// whose every future time is booked is the person doing best on this network,
// and telling them their card is paused would be a false alarm on exactly the
// wrong clinician. The predicate is therefore ZERO FUTURE SLOTS OF ANY STATE.
//
// TWO CAUSES, TWO DIFFERENT FIXES, AND THE COPY MUST NOT CONFLATE THEM. With
// the stamp off, posting more times changes nothing — sending someone to the
// board would cost them ten minutes on the wrong fix.

// ─── RETIRED BY N-19 (2026-09-01) — UNREFERENCED, AND DELIBERATELY SO ───────
// The paused banner these seven strings dressed is gone from ProfileCard, and
// the two MODULE_* arms below went with SettingsPanel's three owned arms.
// WHY THEY ARE KEPT, and it is the startModulePurchase precedent (P-6): copy
// that was ratified verbatim is expensive to re-derive, and the reason each was
// written is the part that would be lost. PAUSED_STAMP_OFF_BODY's second
// sentence in particular was ratified word-for-word on 2026-08-30 because it is
// what stops a clinician spending ten minutes posting times that cannot show.
// DO NOT REWIRE ANY OF THEM. N-19 did not decide they said the wrong thing; it
// decided they said it in the wrong PLACE. The PlexMed screen now says each of
// these where the fix is, which is why a pointer version must not come back:
// state 1 IS "verify your license", state 3 IS "nobody can book you until you
// post some". A second copy that points at that screen is the scattering.
// PAUSED_HORIZON_DAYS below is NOT retired — PlexMedScreen reads it.

export type PracticePaused = 'no_times' | 'stamp_off';

export const PAUSED_TITLE = 'Your card is up, but paused';

/** Stamp live, board empty. Posting times is the fix, so it points at them. */
export const PAUSED_NO_TIMES_BODY =
  'People can find you. Nobody can request a visit until you post open times.';
export const PAUSED_NO_TIMES_POINTER = 'Post them in Settings › PlexMed.';

/**
 * Stamp off. THE SECOND SENTENCE IS THE POINT OF THIS VARIANT — ratified
 * verbatim 2026-08-30 and not to be trimmed: it is what stops someone spending
 * ten minutes on the fix that cannot work.
 */
export const PAUSED_STAMP_OFF_BODY =
  'While your Verified Clinician stamp is off, your times are not shown and nobody can ' +
  'request a visit. Posting more will not change that — the stamp is what is missing.';
export const PAUSED_STAMP_OFF_POINTER =
  'Verify your license in your account, under Verify my license.';

/** The board's own horizon (OpenTimesBoard reads a rolling window). */
export const PAUSED_HORIZON_DAYS = 90;

// ─── THE MODULE ROW (N-4-AMENDED, 2026-08-30) ───────────────────────────────
//
// FOUR ARMS, AND EVERY ONE OF THEM DOES SOMETHING WHEN TAPPED. That is the
// whole test the amendment sets: nobody meets an inert control, and nobody is
// prevented from discovering a product they would pay for.
//
// THE THREE STATES WERE DERRICK'S; THE FOURTH WAS FOUND BY TRACING THE GAP.
// N-1's two conditions give unowned / owned-unverified / owned-verified. But
// the board attaches to a CARD, so owned + verified + NO PRACTICE CARD falls
// between them — and under the original reading the module would vanish there,
// repeating N-4's error one condition later. It was found on the device pass by
// walking the chain rather than by inferring it from the ruling, and ratified
// 2026-08-30.
//
// THE ROW POINTS WITH ITS TEXT AND JUMPS WITH ITS TAP. The pointer line stays
// because it explains WHERE the licence lives, which is worth knowing even when
// the tap takes you there. N-8 is not violated: AccountChip owns Settings and
// the ceremony as two views of ONE sheet, so this is a view switch and N-8's
// target was the stacked modal. CardEditorSheet's P0 gate keeps its
// pointer-ONLY form — it sits inside a different sheet, where the constraint is
// real.

/** Under the label on every arm. Says what the module IS, before it is owned. */
export const MODULE_ROW_TITLE = 'PlexMed';

/** RETIRED BY N-19 — see the block above. Was: owned, licence not live. */
export const MODULE_UNVERIFIED_BODY = 'Verify your license to open your times board.';
/** RETIRED BY N-19 — see the block above. */
export const MODULE_UNVERIFIED_POINTER =
  'Your license lives in your account menu, under My ID.';

/**
 * RETIRED BY N-19 — see the block above. This is the exact string the device
 * pass tapped: "Make a practice card to open your times board.", on a row that
 * navigated to Profile from the Profile tab. It is kept as the artefact of the
 * finding that produced the ruling.
 */
export const MODULE_NO_CARD_BODY = 'Make a practice card to open your times board.';

/**
 * ARM 1's setup line — INLINE AND ALWAYS (ruling P-6, 2026-08-31). PlexMed is
 * bought on the web, where the transaction is; the app names no figure, offers
 * no destination and sells nothing (P-3, P-5).
 *
 * IT SAYS NEITHER "YET" NOR "SOON" ON PURPOSE. The sentence is true forever or
 * it is the wrong sentence — see the invented-tense note on MODULE_UNAVAILABLE.
 */
export const MODULE_SETUP_LINE = 'PlexMed is set up outside the app.';

/**
 * DELIBERATELY UNREFERENCED. DO NOT DELETE, AND DO NOT WIRE A BUTTON BACK TO
 * MAKE IT RENDER (ruling P-6, 2026-08-31).
 *
 * This is startModulePurchase()'s refusal text. That function is a PERMANENT
 * honest guard with no caller — arm 1 lost its tap when the chevron went, because
 * a control whose only possible outcome is a refusal cannot act (N-4's original
 * reasoning, which was right). So nothing renders this string today, and nothing
 * should: if it ever renders again, something is selling PlexMed inside the app.
 *
 * IT IS THE SAME SENTENCE as MODULE_SETUP_LINE and is defined FROM it rather than
 * beside it — one string, two names, each with its own reason. A second copy is a
 * second place for it to drift.
 *
 * WHAT IT USED TO SAY, and why that was wrong: "That isn't on sale yet." AN
 * INVENTED TENSE — "yet" promised an in-app purchase that P-3 forbids and that
 * nobody ever intended to build, and "on sale" is cost language the app may not
 * carry. Neither was a lie anyone told; both were true while the paywall was
 * merely unbuilt, and went false the moment it was ruled to live elsewhere.
 */
export const MODULE_UNAVAILABLE = MODULE_SETUP_LINE;
