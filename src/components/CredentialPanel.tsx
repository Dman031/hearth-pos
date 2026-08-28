import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../styles/theme';
import { formatForDisplay } from '../datetime';
import useEntity from '../hooks/useEntity';
import useMyVerifications from '../hooks/useMyVerifications';
import {
  requestCredentialVerification,
  type CredentialBoard,
  type CredentialRequestStatus,
} from '../services/credentials';
import { startIdentityVerification } from '../services/stripe';

// CredentialPanel — the cold-arrival licence flow (CRED S3, copy approved
// VERBATIM 2026-08-23; a screen may not paraphrase it). Lives as a panel inside
// AccountChip's sheet, beside identity, because that is where the credential
// pill already is and ruling N-1 puts owned/administered things there.
//
// THE SCREEN IS A VIEWER, NEVER THE DRIVER (spec note 4). The ceremony runs
// server-side on a cron; this panel submits once and then watches. States S3/S4
// must survive backgrounding, which is why nothing here holds the outcome —
// useMyVerifications re-reads it.
//
// NOTHING HERE CAN VERIFY ANYTHING. entities.credential_verified has exactly
// one writer (record_verification_outcome, service role) and there is no
// override path (R4). This panel submits a number and renders a status.
//
// DISCIPLINE RULE 7: no protocol language reaches a person. Never "PSV",
// "NPPES", "concordance", "OIG", or a vendor name. The registry is "the U.S.
// provider registry"; the board is "the Oregon licensing board".

/** The boards the ceremony can reach, with their approved user-facing names. */
const BOARDS: ReadonlyArray<{ value: CredentialBoard; label: string }> = [
  { value: 'omb', label: 'Oregon Medical Board' },
  { value: 'oblpct', label: 'Board of Licensed Professional Counselors and Therapists' },
  { value: 'obop', label: 'Board of Psychology' },
];

/** How long a 'pending' ceremony runs before S3 becomes S4 ("Still checking"). */
const SLOW_AFTER_MS = 45_000;

interface CredentialPanelProps {
  /** Closes the sheet. Wired to S5's "See my card". */
  onClose: () => void;
}

export default function CredentialPanel({ onClose }: CredentialPanelProps) {
  const { entity, refresh: refreshEntity } = useEntity();
  const { verifications, refresh: refreshVerifications } = useMyVerifications();

  const [showForm, setShowForm] = useState(false);
  const [board, setBoard] = useState<CredentialBoard | null>(null);
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [startingIdentity, setStartingIdentity] = useState(false);
  // What the RPC said, held only until the server row appears and takes over.
  const [localStatus, setLocalStatus] = useState<CredentialRequestStatus | null>(null);
  // S7a is the ONLY inline error the spec covers. `transportError` is a
  // different thing and is flagged as copy the spec does not yet rule.
  const [malformed, setMalformed] = useState(false);
  const [transportError, setTransportError] = useState(false);

  // The licence row that matters: the newest live one. A voided row is history
  // — it must not present as the current stamp (S5's copy claims a live stamp).
  const licenceRow = useMemo(
    () => verifications.find((v) => v.type === 'license' && v.voided_at === null) ?? null,
    [verifications],
  );

  // Server truth wins the moment it exists; localStatus only covers the gap
  // between the RPC returning and the next read landing.
  const status = licenceRow?.status ?? localStatus;
  const isPending = status === 'pending';

  // S3 → S4. Reset whenever we leave pending so a second submission starts at
  // S3 again rather than inheriting the first one's staleness.
  useEffect(() => {
    if (!isPending) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [isPending]);

  const submit = useCallback(async () => {
    if (board === null || busy) return;
    setBusy(true);
    setMalformed(false);
    setTransportError(false);
    const result = await requestCredentialVerification({
      type: 'license',
      number,
      board,
    });
    if (!result.ok) {
      if (result.reason === 'invalid_input') {
        setMalformed(true);
      } else if (result.reason === 'identity_not_verified') {
        // The gate moved under us — re-read the entity so S0 renders honestly
        // instead of this panel insisting the number was the problem.
        await refreshEntity();
      } else {
        setTransportError(true);
      }
      setBusy(false);
      return;
    }
    setLocalStatus(result.status);
    setBusy(false);
    // Start watching immediately rather than waiting for the next focus.
    await refreshVerifications();
  }, [board, number, busy, refreshEntity, refreshVerifications]);

  const beginIdentity = useCallback(async () => {
    setStartingIdentity(true);
    const result = await startIdentityVerification();
    if (!result.ok) {
      console.warn('[credential] identity verification could not start:', result.reason);
    }
    setStartingIdentity(false);
    await refreshEntity();
  }, [refreshEntity]);

  // ─── S0 · identity gate ───────────────────────────────────────────────────
  if (!entity?.id_verified) {
    return (
      <View style={styles.block}>
        <Text style={styles.title}>Verify your identity first</Text>
        <Text style={styles.body}>
          Your license is checked against the name on your ID, so identity comes first.
        </Text>
        <Pressable
          style={styles.primary}
          onPress={beginIdentity}
          disabled={startingIdentity}
          accessibilityRole="button"
        >
          {startingIdentity ? (
            <ActivityIndicator size="small" color={theme.colors.onAccent} />
          ) : (
            <Text style={styles.primaryLabel}>Verify my identity</Text>
          )}
        </Pressable>
      </View>
    );
  }

  // ─── S5 · verified ────────────────────────────────────────────────────────
  if (status === 'verified') {
    // N-6: the licence NUMBER is deliberately absent. get_my_verifications is a
    // status view and is not widened; the number arrives in Session 2 via
    // get_my_credential_detail(). An omission, never an invented source.
    const verifiedAt = licenceRow?.checked_at
      ? formatForDisplay(licenceRow.checked_at, 'monthYear')
      : null;
    const renewsAt = licenceRow?.expires_at
      ? formatForDisplay(licenceRow.expires_at, 'monthYear')
      : null;
    return (
      <View style={styles.block}>
        <Text style={styles.check}>✓</Text>
        <Text style={styles.title}>Verified Clinician</Text>
        <Text style={styles.body}>
          Your license is verified with the Oregon licensing board. Your cards now carry the
          stamp.
        </Text>
        {verifiedAt ? (
          <Text style={styles.detail}>
            {`verified ${verifiedAt}`}
            {renewsAt ? ` · renews ${renewsAt}` : ''}
          </Text>
        ) : null}
        <Pressable style={styles.primary} onPress={onClose} accessibilityRole="button">
          <Text style={styles.primaryLabel}>See my card</Text>
        </Pressable>
      </View>
    );
  }

  // ─── S6 · manual review ───────────────────────────────────────────────────
  // Also the rendering for S7b (the licence is already bound to another entity)
  // and S7c (the board is unreachable). BOTH RENDER THIS VERBATIM, DELIBERATELY:
  // a second claimant must not learn the licence is already bound, and the
  // vendor must not be blamed for the board's downtime. Do NOT add a
  // distinguishing string, icon, or analytics event a user could observe.
  if (status === 'manual_review') {
    return (
      <View style={styles.block}>
        <Text style={styles.title}>We need a human to double-check this</Text>
        <Text style={styles.body}>
          Something didn’t line up between your ID and the board’s record — usually a name
          that’s written differently in the two places. Someone will look at it, usually within
          a day. We’ll let you know here.
        </Text>
        {/* No retry button, by ruling: a resubmit produces the same outcome and
            teaches people to retry noise. Recovery is the out-of-band ceremony. */}
        <Text style={styles.muted}>Nothing is wrong with your license.</Text>
      </View>
    );
  }

  // ─── S3 / S4 · submitted, still working ───────────────────────────────────
  if (isPending) {
    return (
      <View style={styles.block}>
        <ActivityIndicator color={theme.colors.accent} />
        <Text style={styles.title}>{slow ? 'Still checking…' : 'Checking with the board…'}</Text>
        <Text style={styles.sub}>
          {slow
            ? 'The board’s system is slower than usual. We’ll finish in the background.'
            : 'This usually takes under a minute. You can leave this screen — we’ll keep going.'}
        </Text>
      </View>
    );
  }

  // ─── S2 · board + number ──────────────────────────────────────────────────
  if (showForm) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.block}>
        <Text style={styles.label}>Which board issued your license?</Text>
        {BOARDS.map((b) => {
          const selected = b.value === board;
          return (
            <Pressable
              key={b.value}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => setBoard(b.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                {b.label}
              </Text>
            </Pressable>
          );
        })}

        <Text style={styles.label}>License number</Text>
        <TextInput
          style={styles.input}
          value={number}
          onChangeText={(t) => {
            setNumber(t);
            setMalformed(false);
            setTransportError(false);
          }}
          placeholder="As printed on your license"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
        />
        <Text style={styles.helper}>Enter it exactly — including any letters.</Text>

        {/* S7a — the one inline error the spec rules. */}
        {malformed ? (
          <Text style={styles.danger}>
            That doesn’t look like a license number for this board. Check the format and try
            again.
          </Text>
        ) : null}
        {/* NOT SPEC COPY — flagged for ratification. The spec covers a malformed
            number (S7a) and every server-side outcome (S6), but not a request
            that never reached us. Saying nothing would be worse. */}
        {transportError ? (
          <Text style={styles.danger}>We couldn’t send that just now. Try again.</Text>
        ) : null}

        <Pressable
          style={[styles.primary, (board === null || number.trim().length === 0) && styles.primaryOff]}
          onPress={submit}
          disabled={busy || board === null || number.trim().length === 0}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.colors.onAccent} />
          ) : (
            <Text style={styles.primaryLabel}>Check my license</Text>
          )}
        </Pressable>
      </ScrollView>
    );
  }

  // ─── S1 · entry ───────────────────────────────────────────────────────────
  return (
    <View style={styles.block}>
      <Text style={styles.title}>Verify my license</Text>
      <Text style={styles.body}>
        We check your license directly with the Oregon licensing board and add a Verified
        Clinician stamp to your cards.
      </Text>
      <Pressable
        style={styles.primary}
        onPress={() => setShowForm(true)}
        accessibilityRole="button"
      >
        <Text style={styles.primaryLabel}>Start</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  block: { gap: theme.spacing.md, paddingBottom: theme.spacing.sm },
  title: { ...theme.typography.h2, color: theme.colors.textPrimary },
  body: { ...theme.typography.body, color: theme.colors.textSecondary },
  sub: { ...theme.typography.bodyMuted, color: theme.colors.textMuted },
  muted: { ...theme.typography.bodyMuted, color: theme.colors.textMuted },
  // Wheat is verified chrome; accent2Deep is the TEXT-safe wheat (raw wheat
  // fails contrast on paper).
  check: { fontSize: 32, lineHeight: 38, color: theme.colors.accent2Deep, fontFamily: theme.fonts.bold },
  detail: { ...theme.typography.caption, color: theme.colors.textMuted },
  label: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: theme.spacing.sm,
  },
  option: {
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.borderRadius.card,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
  optionSelected: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentFill,
  },
  optionLabel: { ...theme.typography.body, color: theme.colors.textSecondary },
  optionLabelSelected: { color: theme.colors.accent, fontFamily: theme.fonts.semiBold },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.borderRadius.input,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.regular,
    fontSize: 16,
  },
  helper: { ...theme.typography.caption, color: theme.colors.textMuted },
  danger: { ...theme.typography.bodyMuted, color: theme.colors.danger },
  primary: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.card,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  primaryOff: { opacity: 0.4 },
  primaryLabel: {
    color: theme.colors.onAccent,
    fontFamily: theme.fonts.semiBold,
    fontSize: 16,
  },
});
