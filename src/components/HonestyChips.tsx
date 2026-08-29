import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';

// HonestyChips — PLEXMED S6 PART A. Three chips, in this order, above the
// message. EVERY ONE IS A FACT WITH A NAMED SOURCE; NONE IS A JUDGEMENT.
//
// BUILT TO BE REUSED VERBATIM BY S7. Today's identity chip is this component,
// not a re-authoring of it (S7 A3: "reuse the S6 chip, do not re-author it").
// That is why the identity chip takes a flag rather than a request object.
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

const HISTORY_FIRST_EXPANDED =
  'You have not accepted anything from this person here before. That is a fact about this ' +
  'network, not about their care — they may have been seen anywhere.';

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

interface HonestyChipsProps {
  idVerified: boolean;
  /** Omitted on surfaces where history is not part of the claim (S7 Today). */
  firstContact?: boolean;
  /** A2's established-thread wording differs by surface; S7 uses its own. */
  historyLabels?: { first: string; established: string };
  /** A3. Present on every practice REQUEST; absent on a booked visit. */
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
      <Chip
        label={idVerified ? 'Identity verified' : 'Identity not verified'}
        tone={idVerified ? 'verified' : 'plain'}
        expanded={IDENTITY_EXPANDED}
      />
      {firstContact !== undefined ? (
        <Chip
          label={firstContact ? historyLabels.first : historyLabels.established}
          tone="plain"
          expanded={
            firstContact
              ? HISTORY_FIRST_EXPANDED
              : 'You have accepted something from this person here before.'
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
