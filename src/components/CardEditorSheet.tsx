import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  getGalleryUrls,
  getMediaUrl,
  MAX_GALLERY_IMAGES,
  normalizeFields,
  setGalleryUrls,
  setMediaUrl,
  withoutReservedFields,
  type FieldEntry,
} from '../utils/card-fields';
import {
  actTierRequiresOwnerVerification,
  entityIsVerified,
  seeTierRequiresOwnerVerification,
} from '../services/card-gating';
import { startBusinessVerification } from '../services/stripe';
import PermissionPicker from './PermissionPicker';
import useMediaUpload from '../hooks/useMediaUpload';
import useGalleryUpload from '../hooks/useGalleryUpload';
import GalleryGrid from './GalleryGrid';
import ImageViewer from './ImageViewer';
import { theme } from '../styles/theme';

// CardEditorSheet — the multi-mode Profile card editor (Day 12). One sheet,
// driven by `mode`:
//   'create' → an empty draft, saved via CardContext.createCard
//   'edit'   → an existing card, saved via CardContext.updateCard
//   null     → closed
//
// It edits: title, the card type (kind), the user-named fields, and the two
// SEE/ACT permission tiers. It also edits a media URL, available on ANY card
// type (an event flyer, capability work photos, or a 'content' card that is
// primarily media) — stored in the existing fields jsonb under the reserved
// `media_url` entry (see card-fields.ts). Day 12.5 replaces the URL input with a
// real upload at the TODO(Day 12.5) seam below; the Storage URL flows into the
// SAME field.
//
// VERIFICATION LOCK: the 'verified' see/act tier ("restrict to verified
// callers") requires the owner to be verified (entities.id_verified). The lock
// is enforced HERE (PermissionPicker disables the tier; handleSave double-guards)
// — NOT in the shared createCard/updateCard write path, so onboarding is not
// regressed. See DEFERRED.md for the onboarding-vs-editor enforcement seam.

type EditorMode = 'create' | 'edit' | null;

// Day 14 — a parse-proposed draft used to seed CREATE mode (menu photo → card).
// USER fields only (items carry `available`, describing rows don't); the menu
// photo rides in `mediaUrl`. Optional + only consulted in create mode, so the
// empty-create path (onboarding, ＋ Add) is untouched when no seed is passed.
export interface CardEditorSeed {
  title?: string;
  kind?: CardKind;
  fields?: FieldEntry[];
  mediaUrl?: string;
}

interface CardEditorSheetProps {
  mode: EditorMode;
  card: Card | null; // the card being edited; null in create mode / closed
  onClose: () => void;
  // Pre-fills create mode (e.g. a parsed menu). Ignored in edit mode and when
  // null/undefined — create then starts empty, exactly as before.
  createSeed?: CardEditorSeed | null;
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
  createSeed,
}: CardEditorSheetProps) {
  const { createCard, updateCard, setCardCommerce } = useCards();
  const { entity, refresh: refreshEntity } = useEntity();
  // Latest entity for reads AFTER an awaited refreshEntity() — the closure's
  // `entity` is stale by then; the ref is not.
  const entityRef = useRef(entity);
  entityRef.current = entity;
  // Verified-tier lock matches the network's derivation: ANY badge counts (see
  // entityIsVerified / hearth-network auth.ts), not id_verified alone.
  const ownerVerified = entity ? entityIsVerified(entity) : false;

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CardKind>(DEFAULT_KIND);
  const [fields, setFields] = useState<FieldEntry[]>([]); // user fields, no reserved
  const [mediaUrl, setMediaUrlState] = useState('');
  // Gallery image URLs (Day 15) — persisted as repeated gallery_image entries.
  const [galleryUrls, setGalleryUrlsState] = useState<string[]>([]);
  // The gallery image open in the full viewer (null = closed).
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [seePerm, setSeePerm] = useState<SeePerm>(DEFAULT_SEE);
  const [actPerm, setActPerm] = useState<ActPerm>(DEFAULT_ACT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageBroken, setImageBroken] = useState(false);
  // Day 18 — commerce (EDIT mode only: set_card_commerce needs a card id).
  // Staged locally like every other field; persisted on Save via the RPC.
  const [commerceEnabled, setCommerceEnabled] = useState(false);
  const [priceText, setPriceText] = useState(''); // dollars; '' = not priced
  const [commerceTerms, setCommerceTerms] = useState('');
  const [launchingConnect, setLaunchingConnect] = useState(false);
  const [connectHint, setConnectHint] = useState<string | null>(null);

  // Re-seed local state each time the sheet opens (mode/card change).
  useEffect(() => {
    if (mode === null) {
      return;
    }
    setError(null);
    setImageBroken(false);
    setViewerIndex(null);
    setConnectHint(null);
    if (mode === 'edit' && card) {
      const all = normalizeFields(card.fields);
      setTitle(card.title);
      setKind(card.kind);
      setFields(withoutReservedFields(all));
      setMediaUrlState(getMediaUrl(card.fields));
      setGalleryUrlsState(getGalleryUrls(card.fields));
      setSeePerm(card.see_perm);
      setActPerm(card.act_perm);
      setCommerceEnabled(card.commerce_enabled);
      setPriceText(
        card.price_cents === null ? '' : (card.price_cents / 100).toFixed(2),
      );
      setCommerceTerms(card.commerce_terms ?? '');
    } else {
      // create — seeded from a parsed draft if one was passed, else empty
      // (onboarding / ＋ Add). Items in seed.fields keep their `available` flag,
      // so the orderable toggle shows checked; permissions stay at the safe
      // defaults for the owner to set who-can-order on this confirm screen.
      setTitle(createSeed?.title ?? '');
      setKind(createSeed?.kind ?? DEFAULT_KIND);
      setFields(withoutReservedFields(createSeed?.fields ?? []));
      setMediaUrlState(createSeed?.mediaUrl ?? '');
      setGalleryUrlsState(getGalleryUrls(createSeed?.fields ?? []));
      setSeePerm(DEFAULT_SEE);
      setActPerm(DEFAULT_ACT);
      setCommerceEnabled(false);
      setPriceText('');
      setCommerceTerms('');
    }
  }, [mode, card, createSeed]);

  const visible = mode !== null;

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
  // Day 13 — mark a field as an orderable item (gives it a boolean `available`,
  // defaulting to in-stock) or back to a plain describing field (strips the
  // flag entirely, so no fake `available` rides along — matches the network
  // contract). The one-tap 86 toggle on the Profile card flips it after save.
  const toggleOrderable = (index: number): void => {
    setFields((prev) =>
      prev.map((f, i) => {
        if (i !== index) {
          return f;
        }
        if (typeof f.available === 'boolean') {
          const { available: _omit, ...rest } = f;
          return rest;
        }
        return { ...f, available: true };
      }),
    );
  };

  // Day 18 — the commerce toggle IS the Connect onboarding launch point (no
  // other affordance exists in the app). Off→on while business-unverified:
  // refresh the entity first (the webhook may have verified us since load),
  // and if still unverified, open the Stripe-hosted Express onboarding via
  // startBusinessVerification(). The box never flips on optimistically —
  // entities.business_verified is webhook-owned truth.
  const onCommerceToggle = async (): Promise<void> => {
    setConnectHint(null);
    if (commerceEnabled) {
      setCommerceEnabled(false); // disabling is always allowed
      return;
    }
    if (entity?.business_verified) {
      setCommerceEnabled(true);
      return;
    }
    setLaunchingConnect(true);
    setError(null);
    try {
      await refreshEntity();
      if (entityRef.current?.business_verified) {
        setCommerceEnabled(true);
        return;
      }
      const result = await startBusinessVerification();
      if (result.ok) {
        setConnectHint(
          'Finish payment setup in the browser, then come back and tap again.',
        );
      } else if (result.reason === 'cannot_open_browser') {
        setError("Couldn't open the browser for payment setup.");
      } else {
        setError("Couldn't start payment setup. Try again?");
      }
    } finally {
      setLaunchingConnect(false);
    }
  };

  // Stable so useMediaUpload's callbacks don't re-create each render. Used by
  // BOTH the upload flow (writes the returned Storage URL) and the secondary
  // paste-a-link input — both land in the same media_url field.
  const onMediaChange = useCallback((url: string): void => {
    setMediaUrlState(url);
    setImageBroken(false);
  }, []);

  // Upload machinery (Day 12.5). Owns permissions/picker/upload state; on
  // success it writes the public Storage URL via onMediaChange. Reused by Day 14.
  const {
    uploading,
    error: uploadError,
    pickFromLibrary,
    takePhoto,
  } = useMediaUpload(entity?.id ?? null, onMediaChange);

  // Gallery (Day 15) — multi-image upload. Each success appends its URL (cap-
  // guarded here; the hook also slices the pick to the remaining slots). Held
  // separately from the single media_url path so neither regresses the other.
  const onGalleryUploaded = useCallback((url: string): void => {
    setGalleryUrlsState((prev) =>
      prev.length >= MAX_GALLERY_IMAGES ? prev : [...prev, url],
    );
  }, []);

  const {
    uploading: galleryUploading,
    progress: galleryProgress,
    error: galleryError,
    hasFailures: galleryHasFailures,
    pickAndUpload: pickGallery,
    retryFailed: retryGallery,
  } = useGalleryUpload(entity?.id ?? null, onGalleryUploaded);

  const removeGalleryAt = useCallback((index: number): void => {
    setGalleryUrlsState((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const remainingSlots = MAX_GALLERY_IMAGES - galleryUrls.length;

  const canSave =
    title.trim().length > 0 && !saving && !uploading && !galleryUploading;

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

    // Price parses BEFORE any write ('' = not priced → null; reject junk).
    const trimmedPrice = priceText.trim();
    let priceCents: number | null = null;
    if (trimmedPrice !== '') {
      const dollars = Number(trimmedPrice);
      if (!Number.isFinite(dollars) || dollars < 0) {
        setError('Enter a price like 12.50, or leave it empty.');
        return;
      }
      priceCents = Math.round(dollars * 100);
    }

    setSaving(true);
    setError(null);
    try {
      // Recombine: user fields + reserved media + reserved gallery. setMediaUrl
      // upserts/strips the single media_url entry; setGalleryUrls replaces the
      // repeated gallery_image entries (ordered, capped). Both ride on any card
      // type, kept at the end so the user fields stay at the front.
      const merged = setGalleryUrls(setMediaUrl(fields, mediaUrl), galleryUrls);
      const persistedFields = fieldsToPersist(merged);

      if (mode === 'edit' && card) {
        await updateCard(card.id, {
          title: title.trim(),
          kind,
          fields: persistedFields,
          see_perm: seePerm,
          act_perm: actPerm,
        });
        // Commerce rides a separate write (set_card_commerce RPC — its ONLY
        // path), called only when something commerce actually changed. A
        // failure here lands AFTER the generic save succeeded, so the message
        // scopes the failure to commerce and the sheet stays open.
        const termsValue =
          commerceTerms.trim() === '' ? null : commerceTerms.trim();
        const commerceDirty =
          commerceEnabled !== card.commerce_enabled ||
          priceCents !== card.price_cents ||
          termsValue !== card.commerce_terms;
        if (commerceDirty) {
          try {
            await setCardCommerce(card.id, {
              enabled: commerceEnabled,
              priceCents,
              terms: termsValue,
            });
          } catch (err) {
            console.warn('[CardEditorSheet] commerce save failed:', err);
            setError(
              err instanceof Error && err.message.includes('CONNECT_REQUIRED')
                ? 'Selling needs payment setup finished first — tap the commerce toggle to continue setup.'
                : "The card saved, but the selling settings didn't. Try again?",
            );
            return;
          }
        }
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

            {/* Card type (kind) -------------------------------------------- */}
            <Text style={[styles.sectionLabel, styles.spaced]}>Card type</Text>
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

            {/* Media — available on ANY card type -------------------------- */}
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
                  Couldn't load that image — try uploading it again.
                </Text>
              ) : null}

              {/* PRIMARY path (Day 12.5): take / choose a photo → Supabase
                  Storage. The returned URL flows into the SAME media_url field
                  via onMediaChange, so the render side needs no change. */}
              <View style={styles.mediaButtonRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.mediaButton,
                    pressed && styles.mediaButtonPressed,
                    uploading && styles.mediaButtonDisabled,
                  ]}
                  onPress={() => void takePhoto()}
                  disabled={uploading}
                  accessibilityRole="button"
                  accessibilityLabel="Take a photo"
                >
                  <Text style={styles.mediaButtonLabel}>Take photo</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.mediaButton,
                    pressed && styles.mediaButtonPressed,
                    uploading && styles.mediaButtonDisabled,
                  ]}
                  onPress={() => void pickFromLibrary()}
                  disabled={uploading}
                  accessibilityRole="button"
                  accessibilityLabel="Choose a photo from your library"
                >
                  <Text style={styles.mediaButtonLabel}>Choose photo</Text>
                </Pressable>
              </View>

              {uploading ? (
                <View style={styles.uploadingRow}>
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                  <Text style={styles.uploadingLabel}>Uploading…</Text>
                </View>
              ) : null}

              {uploadError ? (
                <Text style={styles.mediaError}>{uploadError}</Text>
              ) : null}

              {trimmedMedia && !uploading ? (
                <Pressable
                  onPress={() => onMediaChange('')}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Text style={styles.removePhoto}>Remove photo</Text>
                </Pressable>
              ) : null}

              {/* SECONDARY fallback: paste a link. Lands in the same field. */}
              <Text style={styles.mediaHint}>or paste a link</Text>
              <TextInput
                style={styles.mediaInput}
                value={mediaUrl}
                onChangeText={onMediaChange}
                placeholder="paste an image URL (optional)"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!uploading}
              />
            </View>

            {/* Gallery — multiple browsable photos (a content portfolio) ---- */}
            <View style={styles.gallerySection}>
              <View style={styles.galleryHeader}>
                <Text style={[styles.sectionLabel, styles.spaced]}>Gallery</Text>
                <Text style={[styles.galleryCount, styles.spaced]}>
                  {galleryUrls.length} of {MAX_GALLERY_IMAGES}
                </Text>
              </View>

              {galleryUrls.length > 0 ? (
                <GalleryGrid
                  urls={galleryUrls}
                  onPressImage={setViewerIndex}
                  onRemove={removeGalleryAt}
                />
              ) : (
                <Text style={styles.galleryHint}>
                  Add photos people can browse — work samples, a portfolio, your
                  space.
                </Text>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.mediaButton,
                  styles.galleryAddButton,
                  pressed && styles.mediaButtonPressed,
                  (galleryUploading || remainingSlots <= 0) &&
                    styles.mediaButtonDisabled,
                ]}
                onPress={() => void pickGallery(remainingSlots)}
                disabled={galleryUploading || remainingSlots <= 0}
                accessibilityRole="button"
                accessibilityLabel="Add gallery photos"
              >
                <Text style={styles.mediaButtonLabel}>
                  {remainingSlots <= 0 ? 'Gallery full' : 'Add photos'}
                </Text>
              </Pressable>

              {galleryUploading && galleryProgress ? (
                <View style={styles.uploadingRow}>
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                  <Text style={styles.uploadingLabel}>
                    Uploading {galleryProgress.completed + galleryProgress.failed}{' '}
                    of {galleryProgress.total}…
                  </Text>
                </View>
              ) : null}

              {galleryError ? (
                <View style={styles.galleryErrorRow}>
                  <Text style={styles.mediaError}>{galleryError}</Text>
                  {galleryHasFailures && !galleryUploading ? (
                    <Pressable
                      onPress={() => void retryGallery()}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Retry failed gallery uploads"
                    >
                      <Text style={styles.galleryRetry}>Retry</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>

            <ImageViewer
              urls={galleryUrls}
              index={viewerIndex}
              onClose={() => setViewerIndex(null)}
            />

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

            {/* Commerce (Day 18) — EDIT mode only (the set_card_commerce RPC
                needs a card id; a card must exist before it can sell). The
                toggle doubles as the Connect-onboarding launch point. */}
            {mode === 'edit' && card ? (
              <>
                <Text style={[styles.sectionLabel, styles.spaced]}>
                  Commerce
                </Text>
                <Pressable
                  style={styles.orderableRow}
                  onPress={() => void onCommerceToggle()}
                  disabled={saving || launchingConnect}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: commerceEnabled }}
                  accessibilityLabel="Sell from this card"
                >
                  <View
                    style={[
                      styles.checkbox,
                      commerceEnabled && styles.checkboxOn,
                    ]}
                  >
                    {commerceEnabled ? (
                      <Text style={styles.checkboxMark}>✓</Text>
                    ) : null}
                  </View>
                  <Text style={styles.orderableLabel}>
                    {launchingConnect
                      ? 'Opening payment setup…'
                      : 'Sell from this card'}
                  </Text>
                </Pressable>
                {connectHint ? (
                  <Text style={styles.emptyHint}>{connectHint}</Text>
                ) : null}
                {commerceEnabled ? (
                  <View style={styles.fieldCard}>
                    <Text style={styles.orderableLabel}>Price (USD)</Text>
                    <TextInput
                      style={styles.fieldValueInput}
                      value={priceText}
                      onChangeText={setPriceText}
                      placeholder="12.50 (empty = no set price)"
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.orderableLabel}>Terms</Text>
                    <TextInput
                      style={styles.fieldValueInput}
                      value={commerceTerms}
                      onChangeText={setCommerceTerms}
                      placeholder="e.g. payment up front, 24h cancellation"
                      placeholderTextColor={theme.colors.textMuted}
                      multiline
                    />
                  </View>
                ) : null}
              </>
            ) : null}

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
                {/* Orderable-item switch: makes this field a fulfillable item
                    (a menu item, service, slot) you can 86 from your profile. */}
                <Pressable
                  style={styles.orderableRow}
                  onPress={() => toggleOrderable(i)}
                  accessibilityRole="switch"
                  accessibilityState={{
                    checked: typeof f.available === 'boolean',
                  }}
                  accessibilityLabel={`Mark "${f.label || 'this field'}" an orderable item`}
                >
                  <View
                    style={[
                      styles.checkbox,
                      typeof f.available === 'boolean' && styles.checkboxOn,
                    ]}
                  >
                    {typeof f.available === 'boolean' ? (
                      <Text style={styles.checkboxMark}>✓</Text>
                    ) : null}
                  </View>
                  <Text style={styles.orderableLabel}>
                    Orderable item (can be marked sold out)
                  </Text>
                </Pressable>
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
    borderBottomColor: theme.colors.hairline,
  },
  headerTitle: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.semiBold,
  },
  cancel: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  save: {
    ...theme.typography.body,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
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
    borderColor: theme.colors.hairline,
    backgroundColor: theme.colors.surface,
  },
  flavorChipSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentWash,
  },
  flavorChipLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.semiBold,
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
  mediaButtonRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  mediaButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentWash,
  },
  mediaButtonPressed: {
    opacity: 0.6,
  },
  mediaButtonDisabled: {
    opacity: 0.4,
  },
  mediaButtonLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  uploadingLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textSecondary,
  },
  removePhoto: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    fontFamily: theme.fonts.semiBold,
    alignSelf: 'flex-start',
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
  gallerySection: {
    gap: theme.spacing.sm,
  },
  galleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryCount: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
  galleryHint: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
  galleryAddButton: {
    flex: 0, // override mediaButton's flex:1 (that's for the side-by-side row)
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.lg,
  },
  galleryErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  galleryRetry: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
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
    fontFamily: theme.fonts.semiBold,
    paddingVertical: theme.spacing.xs,
  },
  removeField: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    fontFamily: theme.fonts.semiBold,
  },
  fieldValueInput: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.bodyMuted.fontSize,
    paddingVertical: theme.spacing.xs,
    minHeight: 24,
  },
  orderableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentWash,
  },
  checkboxMark: {
    color: theme.colors.accent,
    fontSize: 13,
    fontFamily: theme.fonts.bold,
    lineHeight: 16,
  },
  orderableLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    flexShrink: 1,
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
    fontFamily: theme.fonts.semiBold,
  },
  errorText: {
    ...theme.typography.bodyMuted,
    color: theme.colors.danger,
    marginTop: theme.spacing.md,
  },
});
