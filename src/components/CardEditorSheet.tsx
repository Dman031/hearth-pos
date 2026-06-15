import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ActPerm, Card, CardKind, SeePerm } from '../types/card';
import useCards from '../hooks/useCards';
import useEntity from '../hooks/useEntity';
import {
  fieldsToPersist,
  getMediaUrl,
  normalizeFields,
  setMediaUrl,
  withoutMediaField,
  type FieldEntry,
} from '../utils/card-fields';
import {
  actTierRequiresOwnerVerification,
  entityIsVerified,
  seeTierRequiresOwnerVerification,
} from '../services/card-gating';
import PermissionPicker from './PermissionPicker';
import { theme } from '../styles/theme';

// CardEditorSheet — the multi-mode Profile card editor (Day 12). One sheet,
// driven by `mode`:
//   'create' → an empty draft, saved via CardContext.createCard
//   'edit'   → an existing card, saved via CardContext.updateCard
//   null     → closed
//
// It edits: title, the card FLAVOR (kind), the user-named fields, and the two
// SEE/ACT permission tiers. For the 'content' flavor it also edits a media URL
// (stored in the existing fields jsonb under the reserved `media_url` entry —
// see card-fields.ts). Day 12.5 replaces the URL input with a real upload at the
// TODO(Day 12.5) seam below; the Storage URL flows into the SAME field.
//
// VERIFICATION LOCK: the 'verified' see/act tier ("restrict to verified
// callers") requires the owner to be verified (entities.id_verified). The lock
// is enforced HERE (PermissionPicker disables the tier; handleSave double-guards)
// — NOT in the shared createCard/updateCard write path, so onboarding is not
// regressed. See DEFERRED.md for the onboarding-vs-editor enforcement seam.

type EditorMode = 'create' | 'edit' | null;

interface CardEditorSheetProps {
  mode: EditorMode;
  card: Card | null; // the card being edited; null in create mode / closed
  onClose: () => void;
}

// The four flavors user-pickable in this editor (Day 12), with vendor-facing
// labels (never the raw enum). 'presence' / 'reachability' remain real CardKinds
// but aren't offered here yet — no designed render. See DEFERRED.md.
const FLAVORS: ReadonlyArray<{ kind: CardKind; label: string }> = [
  { kind: 'capability', label: 'Capability' },
  { kind: 'state', label: 'Status' },
  { kind: 'content', label: 'Content' },
  { kind: 'event', label: 'Event' },
];

// Sensible defaults for a brand-new card. see='contacts' / act='off' mirrors the
// safe defaults onboarding uses; flavor defaults to the table default.
const DEFAULT_KIND: CardKind = 'capability';
const DEFAULT_SEE: SeePerm = 'contacts';
const DEFAULT_ACT: ActPerm = 'off';

export default function CardEditorSheet({
  mode,
  card,
  onClose,
}: CardEditorSheetProps) {
  const { createCard, updateCard } = useCards();
  const { entity } = useEntity();
  // Verified-tier lock matches the network's derivation: ANY badge counts (see
  // entityIsVerified / hearth-network auth.ts), not id_verified alone.
  const ownerVerified = entity ? entityIsVerified(entity) : false;

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CardKind>(DEFAULT_KIND);
  const [fields, setFields] = useState<FieldEntry[]>([]); // user fields, no media
  const [mediaUrl, setMediaUrlState] = useState('');
  const [seePerm, setSeePerm] = useState<SeePerm>(DEFAULT_SEE);
  const [actPerm, setActPerm] = useState<ActPerm>(DEFAULT_ACT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageBroken, setImageBroken] = useState(false);

  // Re-seed local state each time the sheet opens (mode/card change).
  useEffect(() => {
    if (mode === null) {
      return;
    }
    setError(null);
    setImageBroken(false);
    if (mode === 'edit' && card) {
      const all = normalizeFields(card.fields);
      setTitle(card.title);
      setKind(card.kind);
      setFields(withoutMediaField(all));
      setMediaUrlState(getMediaUrl(card.fields));
      setSeePerm(card.see_perm);
      setActPerm(card.act_perm);
    } else {
      // create
      setTitle('');
      setKind(DEFAULT_KIND);
      setFields([]);
      setMediaUrlState('');
      setSeePerm(DEFAULT_SEE);
      setActPerm(DEFAULT_ACT);
    }
  }, [mode, card]);

  const visible = mode !== null;
  const isContent = kind === 'content';
  const canSave = title.trim().length > 0 && !saving;

  const setField = (index: number, patch: Partial<FieldEntry>): void => {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  };
  const addField = (): void => {
    setFields((prev) => [...prev, { label: '', value: '' }]);
  };
  const removeField = (index: number): void => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const onMediaChange = (url: string): void => {
    setMediaUrlState(url);
    setImageBroken(false);
  };

  const handleSave = async (): Promise<void> => {
    if (!canSave) {
      return;
    }

    // Code-side guard for the verification lock at the editor boundary (the
    // PermissionPicker already prevents selecting a locked tier; this catches a
    // stale selection if the flavor/owner-state changed underneath).
    if (
      !ownerVerified &&
      (seeTierRequiresOwnerVerification(seePerm) ||
        actTierRequiresOwnerVerification(actPerm))
    ) {
      setError('Verify your identity to restrict to verified callers.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Recombine: media lives in the fields jsonb only for content cards;
      // setMediaUrl('') strips any stale entry for other flavors.
      const merged = setMediaUrl(fields, isContent ? mediaUrl : '');
      const persistedFields = fieldsToPersist(merged);

      if (mode === 'edit' && card) {
        await updateCard(card.id, {
          title: title.trim(),
          kind,
          fields: persistedFields,
          see_perm: seePerm,
          act_perm: actPerm,
        });
      } else {
        await createCard({
          title: title.trim(),
          kind,
          fields: persistedFields,
          see_perm: seePerm,
          act_perm: actPerm,
          // The editor never exposes the verification gate; new cards declare no
          // requirement (same as onboarding). The owner-verification lock above
          // governs the 'verified' tier, not this field.
          verification_required: 'none',
        });
      }
      onClose();
    } catch (err) {
      console.warn('[CardEditorSheet] save failed:', err);
      setError("That didn't save. Try again?");
    } finally {
      setSaving(false);
    }
  };

  const trimmedMedia = mediaUrl.trim();

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
            {mode === 'create' ? 'New card' : 'Edit card'}
          </Text>
          <Pressable
            onPress={() => void handleSave()}
            hitSlop={8}
            disabled={!canSave}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Text style={[styles.save, !canSave && styles.saveDisabled]}>
                Save
              </Text>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title -------------------------------------------------------- */}
            <Text style={styles.sectionLabel}>Title</Text>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="what you want to be found for"
              placeholderTextColor={theme.colors.textMuted}
            />

            {/* Flavor (kind) ----------------------------------------------- */}
            <Text style={[styles.sectionLabel, styles.spaced]}>Flavor</Text>
            <View style={styles.flavorRow}>
              {FLAVORS.map((f) => {
                const selected = f.kind === kind;
                return (
                  <Pressable
                    key={f.kind}
                    onPress={() => setKind(f.kind)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.flavorChip,
                      selected && styles.flavorChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.flavorChipLabel,
                        selected && styles.flavorChipLabelSelected,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Media (content flavor only) --------------------------------- */}
            {isContent ? (
              <View style={styles.mediaSection}>
                <Text style={[styles.sectionLabel, styles.spaced]}>Media</Text>
                {trimmedMedia && !imageBroken ? (
                  <Image
                    source={{ uri: trimmedMedia }}
                    style={styles.mediaPreview}
                    resizeMode="cover"
                    onError={() => setImageBroken(true)}
                    accessibilityIgnoresInvertColors
                  />
                ) : null}
                {trimmedMedia && imageBroken ? (
                  <Text style={styles.mediaError}>
                    Couldn't load that image — check the URL.
                  </Text>
                ) : null}
                {/* TODO(Day 12.5): replace this URL input with a real upload
                    button (image picker → Supabase Storage). The resulting
                    Storage URL flows into this SAME media field via
                    onMediaChange, so nothing here assumes a user-typed URL. */}
                <TextInput
                  style={styles.mediaInput}
                  value={mediaUrl}
                  onChangeText={onMediaChange}
                  placeholder="paste an image URL"
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Text style={styles.mediaHint}>
                  Paste a link to an image for now. Uploading from your photos is
                  coming soon.
                </Text>
              </View>
            ) : null}

            {/* Permissions ------------------------------------------------- */}
            <Text style={[styles.sectionLabel, styles.spaced]}>Permissions</Text>
            <View style={styles.permsBlock}>
              <PermissionPicker
                axis="see"
                value={seePerm}
                ownerVerified={ownerVerified}
                onChange={(p) => setSeePerm(p as SeePerm)}
              />
              <PermissionPicker
                axis="act"
                value={actPerm}
                ownerVerified={ownerVerified}
                onChange={(p) => setActPerm(p as ActPerm)}
              />
            </View>

            {/* Details (user fields) --------------------------------------- */}
            <Text style={[styles.sectionLabel, styles.spaced]}>Details</Text>
            {fields.length === 0 ? (
              <Text style={styles.emptyHint}>
                No details yet. Add a few so people — and their assistants — know
                more.
              </Text>
            ) : null}

            {fields.map((f, i) => (
              <View key={i} style={styles.fieldCard}>
                <View style={styles.fieldHeaderRow}>
                  <TextInput
                    style={styles.fieldLabelInput}
                    value={f.label}
                    onChangeText={(t) => setField(i, { label: t })}
                    placeholder="name (e.g. where)"
                    placeholderTextColor={theme.colors.textMuted}
                    autoCapitalize="none"
                  />
                  <Pressable
                    onPress={() => removeField(i)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove field ${f.label || i + 1}`}
                  >
                    <Text style={styles.removeField}>Remove</Text>
                  </Pressable>
                </View>
                <TextInput
                  style={styles.fieldValueInput}
                  value={f.value}
                  onChangeText={(t) => setField(i, { value: t })}
                  placeholder="value (in your words)"
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                />
              </View>
            ))}

            <Pressable
              style={({ pressed }) => [
                styles.addField,
                pressed && styles.addFieldPressed,
              ]}
              onPress={addField}
              accessibilityRole="button"
              accessibilityLabel="Add a field"
            >
              <Text style={styles.addFieldLabel}>+ Add a field</Text>
            </Pressable>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surface,
  },
  headerTitle: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  cancel: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  save: {
    ...theme.typography.body,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  saveDisabled: {
    opacity: 0.4,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  sectionLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
  spaced: {
    marginTop: theme.spacing.lg,
  },
  titleInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  flavorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  flavorChip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.surface,
    backgroundColor: theme.colors.surface,
  },
  flavorChipSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: 'rgba(212,165,116,0.12)',
  },
  flavorChipLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  flavorChipLabelSelected: {
    color: theme.colors.accent,
  },
  mediaSection: {
    gap: theme.spacing.sm,
  },
  mediaPreview: {
    width: '100%',
    height: 180,
    borderRadius: theme.borderRadius.card,
    backgroundColor: theme.colors.surface,
  },
  mediaError: {
    ...theme.typography.caption,
    color: theme.colors.danger,
  },
  mediaInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyMuted.fontSize,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  mediaHint: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    lineHeight: 16,
  },
  permsBlock: {
    gap: theme.spacing.lg,
  },
  emptyHint: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xs,
  },
  fieldCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  fieldLabelInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    paddingVertical: theme.spacing.xs,
  },
  removeField: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    fontWeight: '600',
  },
  fieldValueInput: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.bodyMuted.fontSize,
    paddingVertical: theme.spacing.xs,
    minHeight: 24,
  },
  addField: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    marginTop: theme.spacing.sm,
  },
  addFieldPressed: {
    opacity: 0.6,
  },
  addFieldLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  errorText: {
    ...theme.typography.bodyMuted,
    color: theme.colors.danger,
    marginTop: theme.spacing.md,
  },
});
