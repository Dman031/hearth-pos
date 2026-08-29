import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { formatForDisplay } from '../datetime';
import useCards from '../hooks/useCards';
import useMyVerifications from '../hooks/useMyVerifications';
import useMoneyBalance from '../hooks/useMoneyBalance';
import PermissionPicker from './PermissionPicker';
import { parseLicenceRef } from '../services/credentials';
import {
  MODALITY_LABEL,
  SESSION_LENGTHS,
  buildPracticeFields,
  readPracticeFields,
  stateName,
  type Modality,
} from '../services/practice';
import { fieldsToPersist, isReservedFieldLabel, normalizeFields } from '../utils/card-fields';
import type { ActPerm, Card, SeePerm } from '../types/card';

// PracticeCardSheet — PLEXMED S5's P1–P4, the practice card's own editor.
//
// WHY THIS IS NOT CardEditorSheet. That sheet's Details section is a free-form
// label/value editor. A practice card's fields are CANONICAL — the network's
// chip and embedding pipeline reads exact lower-cased labels — and it must NOT
// offer an availability/hours/when/open field, because the network ignores
// those on a practice card and an editor that accepts one lets a clinician
// believe something the system will not honour (S5 note 7). Two incompatible
// field models in one 1228-line component is how that file stops being
// maintainable, so this is a sibling, not a branch.
//
// SAME WRITE PATH, THOUGH (S5 note 5): CardContext's createCard / updateCard for
// the card, set_card_commerce for the price. No new card write path exists here.
//
// P0 IS NOT HERE. The gate lives where Practice is chosen, and per N-8 it
// REFUSES AND POINTS rather than opening the ceremony — opening the account
// sheet from inside a card sheet is the stacked modal N-8 exists to prevent.
//
// P5 IS NOT HERE EITHER. "Your card is up, but paused" has to know whether any
// times exist, which is the board's read (get_my_card_slots). It ships with 2b.

const TOTAL_STEPS = 4;

/** Practice defaults. See is the network's baseline reach; act is 'verified'
 *  because a visit request should come from someone who has been checked. */
const DEFAULT_SEE: SeePerm = 'anyone';
const DEFAULT_ACT: ActPerm = 'verified';

interface PracticeCardSheetProps {
  mode: 'create' | 'edit' | null;
  card: Card | null;
  onClose: () => void;
}

export default function PracticeCardSheet({ mode, card, onClose }: PracticeCardSheetProps) {
  const { createCard, updateCard, setCardCommerce } = useCards();
  const { verifications } = useMyVerifications();
  const { balance } = useMoneyBalance();

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [modalities, setModalities] = useState<Modality[]>(['video']);
  const [sessionMinutes, setSessionMinutes] = useState<number>(45);
  const [slidingScale, setSlidingScale] = useState(false);
  const [priceText, setPriceText] = useState('');
  const [seePerm, setSeePerm] = useState<SeePerm>(DEFAULT_SEE);
  const [actPerm, setActPerm] = useState<ActPerm>(DEFAULT_ACT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = mode !== null;
  const isEdit = mode === 'edit';

  // The live verified licences. These are the ONLY source for the states this
  // card claims — a clinician never types where they are licensed.
  const licences = useMemo(
    () =>
      verifications
        .filter((v) => v.type === 'license' && v.status === 'verified' && v.voided_at === null)
        .map((v) => ({ ref: parseLicenceRef(v.registry_ref), checkedAt: v.checked_at }))
        .filter((l): l is { ref: NonNullable<ReturnType<typeof parseLicenceRef>>; checkedAt: string | null } =>
          l.ref !== null,
        ),
    [verifications],
  );
  const licensedStates = useMemo(
    () => Array.from(new Set(licences.map((l) => l.ref.state))),
    [licences],
  );

  // Seed on open. Keyed on the card id + mode so re-renders do not clobber
  // in-progress edits (B.2: local state is for editing, the store is truth).
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setSaving(false);
    if (isEdit && card) {
      const seeded = readPracticeFields(normalizeFields(card.fields));
      setStep(1);
      setTitle(card.title);
      setDescription(seeded.description ?? '');
      setModalities(seeded.modalities ?? ['video']);
      setSessionMinutes(seeded.sessionMinutes ?? 45);
      setSlidingScale(seeded.slidingScale ?? false);
      setPriceText(card.price_cents === null ? '' : (card.price_cents / 100).toFixed(2));
      setSeePerm(card.see_perm);
      setActPerm(card.act_perm);
      return;
    }
    setStep(1);
    setTitle('');
    setDescription('');
    setModalities(['video']);
    setSessionMinutes(45);
    setSlidingScale(false);
    setPriceText('');
    setSeePerm(DEFAULT_SEE);
    setActPerm(DEFAULT_ACT);
  }, [visible, isEdit, card]);

  const toggleModality = useCallback((m: Modality) => {
    setModalities((prev) => {
      // At least one is required — untoggling the last is a no-op rather than
      // a card that offers no way to meet.
      if (prev.includes(m)) return prev.length === 1 ? prev : prev.filter((x) => x !== m);
      return [...prev, m];
    });
  }, []);

  const paymentsReady = balance?.payments_ready === true;

  const save = useCallback(async () => {
    if (saving) return;
    setError(null);

    const trimmedPrice = priceText.trim();
    let priceCents: number | null = null;
    if (trimmedPrice.length > 0) {
      const dollars = Number(trimmedPrice);
      if (!Number.isFinite(dollars) || dollars < 0) {
        setError('Enter a price like 95.00, or leave it empty.');
        return;
      }
      priceCents = Math.round(dollars * 100);
    }

    setSaving(true);
    // RESERVED FIELDS SURVIVE AN EDIT. media_url and gallery_image ride in the
    // same `fields` array; rebuilding from the practice draft alone would
    // silently delete a card's photos, which is the force-write failure the
    // COALESCE-over-force-write rule warns about.
    const preserved = (isEdit && card ? normalizeFields(card.fields) : []).filter((e) =>
      isReservedFieldLabel(e.label),
    );
    const fields = fieldsToPersist([
      ...buildPracticeFields({
        description,
        modalities,
        sessionMinutes,
        licensedStates,
        slidingScale,
      }),
      ...preserved,
    ]);

    try {
      let cardId: string;
      if (isEdit && card) {
        await updateCard(card.id, {
          title: title.trim(),
          kind: 'practice',
          see_perm: seePerm,
          act_perm: actPerm,
          fields,
        });
        cardId = card.id;
      } else {
        const created = await createCard({
          title: title.trim(),
          kind: 'practice',
          see_perm: seePerm,
          act_perm: actPerm,
          // NOT 'none'. A practice card carries its licence requirement so the
          // gate clamps it if the stamp is ever voided — which is what makes
          // the licence-came-off state truthful rather than decorative.
          verification_required: 'license',
          fields,
        });
        cardId = created.id;
      }
      // The single commerce write path (0014). Only when something changed or a
      // price exists — an unpriced card is published without a commerce write.
      if (priceCents !== null || (isEdit && card && card.price_cents !== null)) {
        await setCardCommerce(cardId, {
          enabled: priceCents !== null,
          priceCents,
          terms: null,
        });
      }
      onClose();
    } catch (err) {
      console.error('[PracticeCardSheet] save failed:', err);
      // The database refuses a practice card without a live licence
      // (cards_practice_requires_licence). Say that in the gate's words rather
      // than surfacing a constraint name.
      const message =
        err instanceof Error && /licence|license|practice/i.test(err.message)
          ? 'A practice card offers visits, so we check your license with the board that issued it before it can go up.'
          : 'Couldn’t save that just now. Try again.';
      setError(message);
      setSaving(false);
    }
  }, [
    saving, priceText, description, modalities, sessionMinutes, licensedStates,
    slidingScale, isEdit, card, title, seePerm, actPerm, createCard, updateCard,
    setCardCommerce, onClose,
  ]);

  const canAdvance =
    step === 1 ? title.trim().length > 0 : step === 2 ? modalities.length > 0 : true;

  // In edit mode every section is on one scroll; the stepped flow is for
  // authoring a card that does not exist yet.
  const showStep = (n: number) => isEdit || step === n;

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
          <Pressable onPress={onClose} hitSlop={8} disabled={saving}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {isEdit ? 'Practice card' : 'New practice card'}
          </Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* ── P1 · the card ─────────────────────────────────────────── */}
          {showStep(1) ? (
            <View style={styles.section}>
              <Text style={styles.label}>What do you call this?</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Primary care visit"
                placeholderTextColor={theme.colors.textMuted}
                editable={!saving}
              />

              <Text style={styles.label}>What is this for?</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={description}
                onChangeText={setDescription}
                multiline
                placeholderTextColor={theme.colors.textMuted}
                editable={!saving}
              />
              <Text style={styles.helper}>
                One or two sentences a person reading it cold would understand. This is what
                people search.
              </Text>

              {/* Read-only, wheat chrome. Sourced from the stamp, never typed. */}
              {licences.length > 0 ? (
                <View style={styles.chip}>
                  <Text style={styles.chipStrong}>Verified Clinician</Text>
                  <Text style={styles.chipText}>
                    {` · ${licences[0].ref.state} license`}
                    {licences[0].checkedAt
                      ? ` · verified ${formatForDisplay(licences[0].checkedAt, 'monthYear')}`
                      : ''}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* ── P2 · how you see people ───────────────────────────────── */}
          {showStep(2) ? (
            <View style={styles.section}>
              <Text style={styles.label}>How you meet</Text>
              <View style={styles.row}>
                {(['video', 'in_person'] as const).map((m) => {
                  const on = modalities.includes(m);
                  return (
                    <Pressable
                      key={m}
                      style={[styles.toggle, on && styles.toggleOn]}
                      onPress={() => toggleModality(m)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.toggleLabel, on && styles.toggleLabelOn]}>
                        {MODALITY_LABEL[m]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>How long</Text>
              <View style={styles.row}>
                {SESSION_LENGTHS.map((n) => {
                  const on = n === sessionMinutes;
                  return (
                    <Pressable
                      key={n}
                      style={[styles.toggle, on && styles.toggleOn]}
                      onPress={() => setSessionMinutes(n)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.toggleLabel, on && styles.toggleLabelOn]}>
                        {`${n} min`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.helper}>
                This sets the default length when you post times. You can change any one time.
              </Text>

              <Text style={styles.label}>Where you are licensed</Text>
              {licences.map((l) => (
                <Text key={l.ref.state} style={styles.licenceRow}>
                  {`✓ ${stateName(l.ref.state)}`}
                  {l.checkedAt
                    ? ` · verified ${formatForDisplay(l.checkedAt, 'monthYear')}`
                    : ''}
                </Text>
              ))}
              <Text style={styles.helper}>
                These come from your verified license. To add a state, verify a license there.
              </Text>
            </View>
          ) : null}

          {/* ── P3 · what a visit costs ───────────────────────────────── */}
          {showStep(3) ? (
            <View style={styles.section}>
              {paymentsReady ? (
                <>
                  <Text style={styles.label}>Price per visit</Text>
                  <TextInput
                    style={styles.input}
                    value={priceText}
                    onChangeText={setPriceText}
                    placeholder="95.00"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="decimal-pad"
                    editable={!saving}
                  />
                  <Pressable
                    style={[styles.toggle, slidingScale && styles.toggleOn, styles.selfStart]}
                    onPress={() => setSlidingScale((v) => !v)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: slidingScale }}
                  >
                    <Text style={[styles.toggleLabel, slidingScale && styles.toggleLabelOn]}>
                      I offer sliding scale
                    </Text>
                  </Pressable>
                  {slidingScale ? (
                    <Text style={styles.helper}>
                      The posted price still shows. Sliding scale appears on your full card so
                      people know to ask.
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.title}>Set up payouts to charge for visits</Text>
                  <Text style={styles.body}>
                    You can publish this card without a price and turn charging on later.
                  </Text>
                  {/* Refuses and points (N-8): payouts live in the account
                      sheet, and opening it from inside this sheet would stack
                      modals. */}
                  <Text style={styles.helper}>
                    Payouts live in your account menu, under Money.
                  </Text>
                </>
              )}
            </View>
          ) : null}

          {/* ── P4 · who can see it, who can book it ──────────────────── */}
          {showStep(4) ? (
            <View style={styles.section}>
              <PermissionPicker
                axis="see"
                value={seePerm}
                ownerVerified
                onChange={(p) => setSeePerm(p as SeePerm)}
                label="Who can see this card"
              />
              <PermissionPicker
                axis="act"
                value={actPerm}
                ownerVerified
                onChange={(p) => setActPerm(p as ActPerm)}
                label="Who can request a visit"
              />
              <Text style={styles.helper}>
                Every request is yours to accept or decline. Nothing is charged until you
                accept.
              </Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.primary, (!canAdvance || saving) && styles.primaryOff]}
            disabled={!canAdvance || saving}
            onPress={() => {
              if (!isEdit && step < TOTAL_STEPS) {
                setStep((s) => s + 1);
                return;
              }
              void save();
            }}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.onAccent} />
            ) : (
              <Text style={styles.primaryLabel}>
                {isEdit ? 'Save' : step < TOTAL_STEPS ? 'Next' : 'Publish'}
              </Text>
            )}
          </Pressable>

          {!isEdit && !paymentsReady && step === 3 ? (
            <Pressable
              style={styles.secondary}
              onPress={() => setStep(4)}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryLabel}>Publish without a price</Text>
            </Pressable>
          ) : null}
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
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  section: { gap: theme.spacing.md },
  title: { ...theme.typography.h2, color: theme.colors.textPrimary },
  body: { ...theme.typography.body, color: theme.colors.textSecondary },
  label: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: theme.spacing.sm,
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
  multiline: { minHeight: 96, textAlignVertical: 'top', borderRadius: theme.borderRadius.card },
  helper: { ...theme.typography.caption, color: theme.colors.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  selfStart: { alignSelf: 'flex-start' },
  toggle: {
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.borderRadius.pill,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
  toggleOn: { borderColor: theme.colors.accentBorder, backgroundColor: theme.colors.accentFill },
  toggleLabel: { ...theme.typography.bodyMuted, color: theme.colors.textSecondary },
  toggleLabelOn: { color: theme.colors.accent, fontFamily: theme.fonts.semiBold },
  // Wheat chrome — verified only. accent2Deep is the TEXT-safe wheat.
  chip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accent2Border,
    backgroundColor: theme.colors.accent2Fill,
    borderRadius: theme.borderRadius.pill,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
  },
  chipStrong: { ...theme.typography.caption, color: theme.colors.accent2Deep, fontFamily: theme.fonts.semiBold },
  chipText: { ...theme.typography.caption, color: theme.colors.accent2Deep },
  licenceRow: { ...theme.typography.body, color: theme.colors.textSecondary },
  error: { ...theme.typography.bodyMuted, color: theme.colors.danger },
  primary: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.card,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  primaryOff: { opacity: 0.4 },
  primaryLabel: { color: theme.colors.onAccent, fontFamily: theme.fonts.semiBold, fontSize: 16 },
  secondary: { alignItems: 'center', paddingVertical: theme.spacing.md },
  secondaryLabel: { ...theme.typography.body, color: theme.colors.textSecondary },
});
