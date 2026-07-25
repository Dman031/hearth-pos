import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme, tileSurface } from '../styles/theme';
import useCards from '../hooks/useCards';
import { formatAcceptLabel, formatCents, KIND_LABEL } from '../utils/format';
import type { Inbound } from '../types/inbound';

// A single Incoming tile: the "knock". Kind-aware since Day 21 STOP 4: a
// booking/order resolves its card (the vendor's OWN card, already loaded by
// CardProvider) and shows title + price + terms, and the accept control names
// what is being accepted and for how much ("Accept order — $12.50").
//
// THE JOSH FIX, tile half. Two failures are corrected here:
//   1. One-tap accept — the visible Accept used to only open the opening-line
//      composer; the commit lived a tap deeper. Accept now accepts. The
//      opening line survives as an explicit tertiary "Add a note first".
//   2. Visual collision — the old control was a content-hugging moss pill,
//      right-aligned: byte-for-byte the outgoing bubble's silhouette. The
//      accept is now a full-width BLOCK (12px radius, never pill) with the
//      object and amount in its label — unmistakable as a control.
// After a decision the buttons collapse into the amber receipt so the action
// reads as acknowledged, not vanished.
//
// NOTE: saving a sender to the private rolodex lives in the PlexChat
// conversation header ("Add to contacts"), NOT here — the post-accept receipt
// was unreachable (Accept navigates to PlexChat before it paints; the
// pending-only Incoming list then unmounts the tile). See
// PlexChatScreen.AddContactButton.

type Outcome = 'accepted' | 'declined';

interface InboundTileProps {
  inbound: Inbound;
  // Returns a resolved promise on success; throws on failure (tile shows error).
  onAccept: (inbound: Inbound, body: string) => Promise<void>;
  onDecline: (inbound: Inbound) => Promise<void>;
}

export default function InboundTile({ inbound, onAccept, onDecline }: InboundTileProps) {
  const { cards } = useCards();
  const [composing, setComposing] = useState<boolean>(false);
  const [body, setBody] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [receipt, setReceipt] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The knock's card is the recipient's own card — CardProvider already holds
  // it; no fetch. null for kind 'message' (card_id null) or a deleted card.
  const card = inbound.card_id ? (cards.find((c) => c.id === inbound.card_id) ?? null) : null;
  const isCommerce = inbound.kind === 'booking' || inbound.kind === 'order';
  const priceCents = card?.price_cents ?? null;
  const currency = card?.price_currency ?? 'usd';
  const acceptLabel = formatAcceptLabel(inbound.kind, priceCents, currency);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await onAccept(inbound, body.trim());
      setReceipt('accepted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDecline(inbound);
      setReceipt('declined');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.tile}>
      <View style={styles.headerRow}>
        <View style={styles.kindBadge}>
          <Text style={styles.kindText}>{KIND_LABEL[inbound.kind]}</Text>
        </View>
        {isCommerce && priceCents !== null ? (
          <Text style={styles.priceText}>{formatCents(priceCents, currency)}</Text>
        ) : null}
      </View>

      {isCommerce && card ? (
        <View style={styles.cardBlock}>
          <Text style={styles.cardTitle}>{card.title}</Text>
          {card.commerce_terms ? <Text style={styles.cardTerms}>{card.commerce_terms}</Text> : null}
        </View>
      ) : null}

      <Text style={styles.message}>{inbound.message}</Text>

      {receipt ? (
        // The amber receipt — the acknowledged outcome. Saving the sender to the
        // private rolodex lives in the PlexChat conversation header, not here.
        <View style={styles.receiptRow}>
          <Text style={styles.receiptText}>
            {receipt === 'accepted' ? 'Accepted — conversation opened' : 'Declined'}
          </Text>
        </View>
      ) : composing ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={body}
            onChangeText={setBody}
            placeholder="Add an opening line (optional)"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            editable={!busy}
          />
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.declineBtn, busy && styles.btnDisabled]}
              onPress={() => setComposing(false)}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.declineText}>Back</Text>
            </Pressable>
            <Pressable
              style={[styles.acceptBtn, busy && styles.btnDisabled]}
              onPress={accept}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.acceptText}>{busy ? 'Accepting…' : acceptLabel}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.declineBtn, busy && styles.btnDisabled]}
              onPress={decline}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.declineText}>Decline</Text>
            </Pressable>
            <Pressable
              style={[styles.acceptBtn, busy && styles.btnDisabled]}
              onPress={accept}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.acceptText}>{busy ? 'Accepting…' : acceptLabel}</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.noteLink}
            onPress={() => setComposing(true)}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.noteLinkText}>Add a note first</Text>
          </Pressable>
        </>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    ...tileSurface,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  kindBadge: {
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  kindText: {
    ...theme.typography.caption,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
  },
  priceText: {
    ...theme.typography.body,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textPrimary,
  },
  cardBlock: {
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  cardTitle: {
    ...theme.typography.body,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textPrimary,
  },
  cardTerms: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
  message: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.lg,
  },
  composer: {
    gap: theme.spacing.md,
  },
  input: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.md,
    minHeight: 44,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  // Block-shaped controls (12px radius, full row) — deliberately NOT the
  // right-aligned moss pill, which was the outgoing bubble's exact silhouette
  // (the Day-19/07-24 root cause).
  declineBtn: {
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.textMuted,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.semiBold,
  },
  acceptBtn: {
    flex: 1,
    borderRadius: theme.borderRadius.card,
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    ...theme.typography.body,
    color: theme.colors.onAccent,
    fontFamily: theme.fonts.semiBold,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  noteLink: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.sm,
  },
  noteLinkText: {
    ...theme.typography.caption,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
  },
  receiptRow: {
    borderRadius: theme.borderRadius.card,
    backgroundColor: theme.colors.accentWash, // accent wash — the receipt tint
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  receiptText: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
  },
  errorText: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    marginTop: theme.spacing.sm,
  },
});
