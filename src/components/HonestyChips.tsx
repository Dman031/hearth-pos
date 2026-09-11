import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';

// HonestyChips — PLEXMED S6 PART A. Three chips, in this order, above the
// message. EVERY ONE IS A FACT WITH A NAMED SOURCE; NONE IS A JUDGEMENT.
//
// BUILT TO BE REUSED VERBATIM BY S7. Today's identity chip is this component,
// not a re-authoring of it (S7 A3: "reuse the S6 chip, do not re-author it").
// That is why the identity chip takes a flag rather than a request object — and
// as of N-21-B item 4 that reuse is real rather than anticipated: Today passes
// idVerified off get_my_day's sender_id_verified. NOT ONE LINE OF THIS FILE
// CHANGED to make it render, which is what "do not re-author it" bought.
//
// A1 RENDERS IN BOTH STATES ON PURPOSE. A missing chip and an unverified person
// must never look alike on a clinical surface.
//
// A3 HAS NO FALSE STATE AND NO ABSENCE. A conditional disclaimer would be a
// verdict by another name — if it appeared only sometimes, its absence would
// read as "this one has been checked", which nobody has done.
//
// "NEW PATIENT" IS NEVER USED HERE (S6-3). New vs. established patient is a
// billing distinction this network cannot make; it lives in exactly one place,
// the clinician's own pick at wrap.

const IDENTITY_EXPANDED =
  'A government photo ID was checked against a live selfie. That is all it means — nothing ' +
  'about this person’s health, history, or coverage was checked.';

// ── S6-3: THE LITERAL "on this network", IN BOTH BRANCHES ───────────────────
// "Expanded text must contain 'on this network' and must never imply a care
// relationship." The scoping IS the point of the phrase: it says the fact is
// about this network's records and nothing wider.
//
// NEITHER BRANCH CARRIED IT. This one said "here before" and then "a fact about
// this network" — near the ruled wording, not it — and the established branch
// said only "here before". The ruling-compliance sweep (2026-09-11) caught the
// established branch and wrongly passed this one on the strength of "about this
// network"; corrected here, and recorded because a near-match is exactly what a
// literal requirement exists to refuse.
//
// Both now open on the same scoping clause and close on the same care
// disclaimer, so the two states of one chip read as one statement.
const HISTORY_FIRST_EXPANDED =
  'You have not accepted anything from this person on this network before. That is a fact ' +
  'about this network, not about their care — they may have been seen anywhere.';

const HISTORY_ESTABLISHED_EXPANDED =
  'You have accepted something from this person on this network before. That is a fact ' +
  'about this network, not about their care.';

const DISCLAIMER_EXPANDED =
  'Nobody has assessed how urgent this is — not this network, not a clinician. What you see ' +
  'below is what this person said, in their words. Assistants on this network are instructed ' +
  'to send anyone in crisis to 988 instead of booking, but that instruction is not a check ' +
  'and no one confirmed it was followed.';

type ChipTone = 'verified' | 'plain' | 'notice';

function Chip({ label, tone, expanded }: { label: string; tone: ChipTone; expanded: string }) {
  return (
    <Pressable
      style={[
        styles.chip,
        tone === 'verified' && styles.verified,
        tone === 'notice' && styles.notice,
      ]}
      onPress={() => Alert.alert(label, expanded, [{ text: 'Close', style: 'cancel' }])}
      accessibilityRole="button"
      accessibilityHint="Explains what this means"
    >
      <Text
        style={[
          styles.label,
          tone === 'verified' && styles.verifiedLabel,
          tone === 'notice' && styles.noticeLabel,
        ]}
      >
        {tone === 'verified' ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

// ── A3 IS NOT A FACT-CHIP, AND GROUPING IT WITH TWO WAS THE DEFECT ──────────
//
// S6-1: "UNCONDITIONAL, and that is load-bearing: this chip is a disclaimer
// about the NETWORK, not a fact about the person. A disclaimer that renders
// sometimes is a verdict by another name."
//
// A1 and A2 are facts about a person and come from get_my_pending_requests, so
// when that read fails they are OMITTED rather than guessed — which is right,
// and unchanged. A3 needs no read at all: it says what nobody did. It was
// nonetheless rendered through the same props object behind the same `pending`
// gate, so a failed chips read silently took the disclaimer down with the two
// facts it has nothing to do with.
//
// THE FIX IS THE PROPS, NOT THE LAYOUT. idVerified and firstContact were always
// optional-meaning-absent; callers now pass `pending?.x`, so a null read yields
// undefined and those two chips disappear exactly as before while showDisclaimer
// stays literal. One row, same order, same component — the S7 A3 instruction
// ("reuse the S6 chip, do not re-author it") applies to this repair too.

interface HonestyChipsProps {
  /** OPTIONAL, and undefined means NO IDENTITY CHIP AT ALL — not an unverified
   *  one. Passing `false` renders "Identity not verified", which is a fact;
   *  passing nothing renders no chip, which is the absence of one. Never use
   *  `false` to mean "we did not check" — that is the distinction this prop's
   *  optionality exists for.
   *
   *  TODAY NOW PASSES IT (N-21-B item 4, migration 0056). It did not under
   *  N-17, and the reason was EVIDENTIAL, not structural: get_my_day returned no
   *  verification flag, so there was no fact to render and `false` would have
   *  been a claim nobody made. 0056 adds sender_id_verified and the ruling names
   *  this chip as its purpose. Corrected here rather than deleted, because the
   *  reason the omission was right is what stops it being re-derived as a rule.
   *  TodayTile gates it on card_kind = 'practice' (N-2 keeps Today generic). */
  idVerified?: boolean;
  /** Omitted on surfaces where history is not part of the claim (S7 Today). */
  firstContact?: boolean;
  /** A2's established-thread wording differs by surface; S7 uses its own. */
  historyLabels?: { first: string; established: string };
  /**
   * A3. Present on every practice REQUEST; absent on a booked visit.
   *
   * NEVER DERIVE THIS FROM A READ. It is true of every practice request whether
   * or not anything loaded — see the block above. The only correct reason to
   * pass false is that the surface is not a practice request.
   */
  showDisclaimer?: boolean;
}

export default function HonestyChips({
  idVerified,
  firstContact,
  historyLabels = { first: 'First time on your network', established: 'You’ve spoken before' },
  showDisclaimer = false,
}: HonestyChipsProps) {
  return (
    <View style={styles.row}>
      {idVerified !== undefined ? (
        <Chip
          label={idVerified ? 'Identity verified' : 'Identity not verified'}
          tone={idVerified ? 'verified' : 'plain'}
          expanded={IDENTITY_EXPANDED}
        />
      ) : null}
      {firstContact !== undefined ? (
        <Chip
          label={firstContact ? historyLabels.first : historyLabels.established}
          tone="plain"
          expanded={
            firstContact
              ? HISTORY_FIRST_EXPANDED
              : HISTORY_ESTABLISHED_EXPANDED
          }
        />
      ) : null}
      {showDisclaimer ? (
        <Chip
          label="NOT TRIAGED · IN THEIR OWN WORDS"
          tone="notice"
          expanded={DISCLAIMER_EXPANDED}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    backgroundColor: theme.colors.surfaceInset,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  // Wheat chrome is the verified tier; accent2Deep is the TEXT-safe wheat.
  verified: { borderColor: theme.colors.accent2Border, backgroundColor: theme.colors.accent2Fill },
  notice: { borderColor: theme.colors.hairline, backgroundColor: 'transparent' },
  label: {
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textSecondary,
  },
  verifiedLabel: { color: theme.colors.accent2Deep },
  noticeLabel: { color: theme.colors.textMuted },
});
