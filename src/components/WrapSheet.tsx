import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../styles/theme';
import { wrapVisit, type DayVisit } from '../services/visits';
import {
  BILLING_HEADER,
  BILLING_HELP,
  CADENCE_HEADER,
  CADENCE_HELP,
  CADENCE_NONE,
  CPT_SHORT_LIST,
  FOLLOW_UP_HEADER,
  FOLLOW_UP_HELP,
  ICD_HEADER,
  ICD_HELP,
  PLAN_HEADER,
  PLAN_MAX_ITEMS,
  PLAN_SHARED_NOTE,
  PLAN_TOO_MANY,
  VISIT_KIND_LABELS,
  WRAP_FOOTER,
  WRAP_HEADER,
} from '../services/visit-copy';

// WrapSheet — PLEXMED S7 PART C. Ninety seconds, one call.
//
// PUSHED FROM THE TODAY TILE (ruling N-16, which amended N-3). N-3's board half
// was always the load-bearing one — a board is meaningless without a practice
// card. A wrap is meaningless without a VISIT, and the visit is on Engagement.
// Sending a clinician two taps into the account sheet immediately after a visit
// is the Josh fix in miniature.
//
// ONE CALL, ALL OR NOTHING. wrap_visit upserts the record, posts the plan, sets
// the cadence and completes the visit IN ONE TRANSACTION — a half-wrap is not a
// state. This sheet therefore assembles every field and makes a SINGLE call. It
// must never be decomposed into steps that could strand between them.
//
// THE CPT LIST IS RENDERED IN THE GIVEN ORDER, NOTHING PRESELECTED, NEVER
// REORDERED (S7-6). Nothing about the visit ranks it. It is not exhaustive and
// does not pretend to be, and it is on counsel review paired with the superbill
// template — neither reaches anyone outside the TEST COHORT until that returns.
//
// ICD IS FREE TEXT (S7-9). No lookup, no autocomplete, no list: any list we
// authored would be a suggestion wearing a different hat.

/** Cadence options in days. `null` clears it. */
const CADENCE_DAYS = [7, 14, 30, 90];

interface WrapSheetProps {
  visit: DayVisit | null;
  /** Prefills the billing name. The clinician corrects it; nothing checks it. */
  peerName: string | null;
  onClose: () => void;
  onWrapped: () => void;
}

export default function WrapSheet({ visit, peerName, onClose, onWrapped }: WrapSheetProps) {
  const [planText, setPlanText] = useState('');
  const [visitKind, setVisitKind] = useState<'new' | 'follow_up' | null>(null);
  const [cpt, setCpt] = useState<string | null>(null);
  const [icd, setIcd] = useState('');
  const [duration, setDuration] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientDob, setPatientDob] = useState('');
  const [cadence, setCadence] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = visit !== null;

  useEffect(() => {
    if (!visible || !visit) return;
    setPlanText('');
    setVisitKind(null);
    setCpt(null);
    setIcd('');
    // Prefilled from the booked time's own length; the clinician may correct it.
    setDuration(
      visit.scheduled_for && visit.ends_at
        ? String(
            Math.round(
              (new Date(visit.ends_at).getTime() - new Date(visit.scheduled_for).getTime()) / 60000,
            ),
          )
        : '',
    );
    setPatientName(peerName ?? '');
    setPatientDob('');
    setCadence(null);
    setError(null);
    setBusy(false);
  }, [visible, visit, peerName]);

  // One line per plan item. Blank lines are dropped rather than posted as empty
  // instructions.
  const planItems = planText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const planTooMany = planItems.length > PLAN_MAX_ITEMS;

  const submit = useCallback(async () => {
    if (!visit || busy) return;
    // REFUSED, NEVER TRUNCATED (S7-5).
    if (planTooMany) {
      setError(PLAN_TOO_MANY);
      return;
    }
    setBusy(true);
    setError(null);

    const durationMinutes = duration.trim().length > 0 ? Number(duration.trim()) : null;
    if (durationMinutes !== null && !Number.isFinite(durationMinutes)) {
      setBusy(false);
      setError('Enter the length in minutes, or leave it empty.');
      return;
    }
    const icdCodes = icd
      .split(/[,\n]/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    const result = await wrapVisit({
      engagementId: visit.engagement_id,
      visitKind,
      cptCode: cpt,
      icdCodes: icdCodes.length > 0 ? icdCodes : null,
      durationMinutes,
      patientName: patientName.trim().length > 0 ? patientName.trim() : null,
      patientDob: patientDob.trim().length > 0 ? patientDob.trim() : null,
      planItems: planItems.length > 0 ? planItems : null,
      nudgeAfterDays: cadence,
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === 'already_wrapped'
          ? 'This visit is already wrapped.'
          : result.reason === 'plan_too_many'
            ? PLAN_TOO_MANY
            : 'Couldn’t save that just now. Nothing was changed — try again.',
      );
      return;
    }
    onWrapped();
    onClose();
  }, [
    visit, busy, planTooMany, duration, icd, visitKind, cpt, patientName, patientDob,
    planItems, cadence, onWrapped, onClose,
  ]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerBar}>
          <Pressable onPress={onClose} hitSlop={8} disabled={busy}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{WRAP_HEADER}</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* C1 · the plan */}
          <Text style={styles.label}>{PLAN_HEADER}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={planText}
            onChangeText={setPlanText}
            placeholder="One thing per line"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            editable={!busy}
          />
          <Text style={styles.helper}>{PLAN_SHARED_NOTE}</Text>
          {planTooMany ? <Text style={styles.error}>{PLAN_TOO_MANY}</Text> : null}

          {/* C2 · visit kind — the ONE place these words appear. */}
          <Text style={styles.label}>Visit kind</Text>
          <View style={styles.row}>
            {(['new', 'follow_up'] as const).map((k) => (
              <Pressable
                key={k}
                style={[styles.chip, visitKind === k && styles.chipOn]}
                onPress={() => setVisitKind(visitKind === k ? null : k)}
                accessibilityRole="button"
                accessibilityState={{ selected: visitKind === k }}
              >
                <Text style={[styles.chipLabel, visitKind === k && styles.chipLabelOn]}>
                  {VISIT_KIND_LABELS[k]}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* C2 · CPT — given order, nothing preselected, never reordered. */}
          <Text style={styles.label}>Visit code</Text>
          <View style={styles.cptList}>
            {CPT_SHORT_LIST.map((c) => (
              <Pressable
                key={c.code}
                style={[styles.cptRow, cpt === c.code && styles.cptRowOn]}
                onPress={() => setCpt(cpt === c.code ? null : c.code)}
                accessibilityRole="button"
                accessibilityState={{ selected: cpt === c.code }}
              >
                <Text style={[styles.cptCode, cpt === c.code && styles.chipLabelOn]}>{c.code}</Text>
                <Text style={styles.cptLabel}>{c.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* C2 · ICD — free text. */}
          <Text style={styles.label}>{ICD_HEADER}</Text>
          <TextInput
            style={styles.input}
            value={icd}
            onChangeText={setIcd}
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
          />
          <Text style={styles.helper}>{ICD_HELP}</Text>

          <Text style={styles.label}>Length (minutes)</Text>
          <TextInput
            style={styles.input}
            value={duration}
            onChangeText={setDuration}
            keyboardType="number-pad"
            editable={!busy}
          />

          {/* C3 · the billing block. That helper is the whole ruling in one
              place: the stamps are the network's claim, the name and DOB are
              the clinician's. Storing them is safe precisely because no
              verification claim attaches to them. */}
          <Text style={styles.label}>{BILLING_HEADER}</Text>
          <TextInput
            style={styles.input}
            value={patientName}
            onChangeText={setPatientName}
            placeholder="Name"
            placeholderTextColor={theme.colors.textMuted}
            editable={!busy}
          />
          <TextInput
            style={styles.input}
            value={patientDob}
            onChangeText={setPatientDob}
            placeholder="Date of birth (YYYY-MM-DD)"
            placeholderTextColor={theme.colors.textMuted}
            autoCorrect={false}
            editable={!busy}
          />
          <Text style={styles.helper}>{BILLING_HELP}</Text>

          {/* C4 · cadence. Nothing fires; the copy says so. */}
          <Text style={styles.label}>{CADENCE_HEADER}</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.chip, cadence === null && styles.chipOn]}
              onPress={() => setCadence(null)}
              accessibilityRole="button"
            >
              <Text style={[styles.chipLabel, cadence === null && styles.chipLabelOn]}>
                {CADENCE_NONE}
              </Text>
            </Pressable>
            {CADENCE_DAYS.map((d) => (
              <Pressable
                key={d}
                style={[styles.chip, cadence === d && styles.chipOn]}
                onPress={() => setCadence(d)}
                accessibilityRole="button"
              >
                <Text style={[styles.chipLabel, cadence === d && styles.chipLabelOn]}>
                  {`${d} days`}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.helper}>{CADENCE_HELP}</Text>

          {/* C5 · the follow-up offer. PARTIAL, AND SAID SO: the action is
              post_card_slots plus a drafted message, and the time picker lives
              on the board. Per N-8 this points rather than opening a second
              picker inside a sheet. The clinician cannot book on the patient's
              behalf — every path that creates a request derives the sender from
              the caller, and minting one from the patient would fabricate
              their consent. */}
          <Text style={styles.label}>{FOLLOW_UP_HEADER}</Text>
          <Text style={styles.helper}>{FOLLOW_UP_HELP}</Text>
          <Text style={styles.helper}>
            Post the time on your open times board, in Settings › PlexMed.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.primary, busy && styles.off]}
            disabled={busy}
            onPress={() => void submit()}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator size="small" color={theme.colors.onAccent} />
            ) : (
              <Text style={styles.primaryLabel}>Wrap the visit</Text>
            )}
          </Pressable>

          {/* C6 · unconditional. A promise that renders sometimes is not a promise. */}
          <Text style={styles.footer}>{WRAP_FOOTER}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.hairline,
  },
  headerTitle: { ...theme.typography.body, fontFamily: theme.fonts.semiBold, color: theme.colors.textPrimary },
  headerRight: { width: 56 },
  cancel: { ...theme.typography.body, color: theme.colors.accent, width: 56 },
  content: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  label: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: theme.spacing.md,
  },
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
  multiline: { minHeight: 120, textAlignVertical: 'top', borderRadius: theme.borderRadius.card },
  helper: { ...theme.typography.caption, color: theme.colors.textMuted },
  error: { ...theme.typography.bodyMuted, color: theme.colors.danger },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.borderRadius.pill,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
  chipOn: { borderColor: theme.colors.accentBorder, backgroundColor: theme.colors.accentFill },
  chipLabel: { ...theme.typography.bodyMuted, color: theme.colors.textSecondary },
  chipLabelOn: { color: theme.colors.accent, fontFamily: theme.fonts.semiBold },
  cptList: { gap: theme.spacing.xs },
  cptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    backgroundColor: theme.colors.surface,
  },
  cptRowOn: { borderColor: theme.colors.accentBorder, backgroundColor: theme.colors.accentFill },
  cptCode: { ...theme.typography.body, fontFamily: theme.fonts.semiBold, color: theme.colors.textPrimary },
  cptLabel: { ...theme.typography.caption, color: theme.colors.textMuted, flexShrink: 1 },
  primary: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.card,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  primaryLabel: { color: theme.colors.onAccent, fontFamily: theme.fonts.semiBold, fontSize: 16 },
  off: { opacity: 0.4 },
  footer: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: theme.spacing.md },
});
