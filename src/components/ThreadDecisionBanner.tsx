import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';
import { supabase } from '../services/supabase';
import useCards from '../hooks/useCards';
import useEntity from '../hooks/useEntity';
import useThreadPendingInbound from '../hooks/useThreadPendingInbound';
import useThreadEngagements from '../hooks/useThreadEngagements';
import { formatAcceptLabel, formatCents, ENGAGEMENT_KIND_LABEL, KIND_LABEL } from '../utils/format';
import { formatForDisplay } from '../datetime';
import type { Inbound } from '../types/inbound';
import type { Engagement } from '../types/engagement';

// THE DECISION SLOT — "something in this conversation needs your decision",
// pinned above the composer (Day 21 STOP 4, the Josh fix). This is a SLOT, not
// a pending-inbound special case: today its only populating source is a
// pending knock addressed to the caller, because that is the only structured
// decision the network can put on a thread — but the 07-24 evidence shows the
// other shape (a repeat order arriving as prose creates no inbound row, so
// nothing renders here). When the network-side repeat-order fix lands, that
// source feeds this same slot; the slot's contract is "the union of decision
// sources on this thread", not "the inbound table".
//
// CHIPS (Day 22 ruling, 2026-07-30 — the 621e521a pile-up fix): only
// engagements with status 'accepted' render, as role-labeled chips — the
// seller reads "Awaiting payment", the buyer reads "Payment due" (same row,
// different next actor; role derived from seller_entity_id against the
// signed-in entity). paid/fulfilled/cancelled never render here — the
// Engagement tab owns history; the slot is what needs someone NOW, and an
// empty slot is correct. The chip names kind · date · amount — the status
// word is gone (only one status renders) and the date is what distinguishes
// two otherwise-identical orders. No buyer actions yet: cancel is Day 22
// build item 5, blocked on the charge.refunded handler.
//
// WHY IT LOOKS THE WAY IT DOES (root cause of the Day-19/07-24 failures): the
// outgoing message bubble is a content-hugging moss pill on the right. The
// accept control here is deliberately its opposite on every axis — full-width,
// left-anchored, a bordered surface panel with a wheat attention edge, and a
// block-shaped (12px, never pill) button whose label names the object and the
// amount ("Accept order — $12.50"). It must never be mistakable for a message.
//
// Writes go through respond_to_inbound ONLY — the single canonical write path —
// always with the EXPLICIT id of the item being decided, never a
// newest-pending-wins resolution. No opening-line composer here: the vendor is
// already inside the conversation.

type Busy = 'accepting' | 'declining';

function DecisionPanel({
  item,
  cardTitle,
  cardTerms,
  priceCents,
  currency,
  busy,
  error,
  onAccept,
  onDecline,
}: {
  item: Inbound;
  cardTitle: string | null;
  cardTerms: string | null;
  priceCents: number | null;
  currency: string;
  busy: Busy | null;
  error: string | null;
  onAccept: (item: Inbound) => void;
  onDecline: (item: Inbound) => void;
}) {
  const acceptLabel = formatAcceptLabel(item.kind, priceCents, currency);
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.kindText}>{KIND_LABEL[item.kind]}</Text>
        {priceCents !== null ? (
          <Text style={styles.priceText}>{formatCents(priceCents, currency)}</Text>
        ) : null}
      </View>
      {cardTitle ? <Text style={styles.titleText}>{cardTitle}</Text> : null}
      {cardTerms ? <Text style={styles.termsText}>{cardTerms}</Text> : null}
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.declineBtn, busy && styles.btnDisabled]}
          onPress={() => onDecline(item)}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy !== null }}
        >
          <Text style={styles.declineText}>{busy === 'declining' ? 'Declining…' : 'Decline'}</Text>
        </Pressable>
        <Pressable
          style={[styles.acceptBtn, busy && styles.btnDisabled]}
          onPress={() => onAccept(item)}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy !== null }}
        >
          <Text style={styles.acceptText}>{busy === 'accepting' ? 'Accepting…' : acceptLabel}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export default function ThreadDecisionBanner({ threadId }: { threadId: string }) {
  const { pending, refresh } = useThreadPendingInbound(threadId);
  const { engagements } = useThreadEngagements(threadId); // accepted-only (ruling 1)
  const { cards } = useCards();
  const { entity } = useEntity();
  const myEntityId = entity?.id ?? null;
  const [busyById, setBusyById] = useState<Record<string, Busy | undefined>>({});
  const [errorById, setErrorById] = useState<Record<string, string | undefined>>({});

  const decide = useCallback(
    async (item: Inbound, decision: 'accepted' | 'passed') => {
      setBusyById((prev) => ({ ...prev, [item.id]: decision === 'accepted' ? 'accepting' : 'declining' }));
      setErrorById((prev) => ({ ...prev, [item.id]: undefined }));
      // EXPLICIT p_inbound_id — the tapped panel's own row, never inferred.
      const { error: rpcErr } = await supabase.rpc('respond_to_inbound', {
        p_inbound_id: item.id,
        p_decision: decision,
        p_body: null,
      });
      setBusyById((prev) => ({ ...prev, [item.id]: undefined }));
      if (rpcErr) {
        console.warn('[ThreadDecisionBanner] respond_to_inbound failed', {
          inboundId: item.id,
          decision,
          error: rpcErr.message,
        });
        setErrorById((prev) => ({
          ...prev,
          [item.id]: decision === 'accepted' ? 'Could not accept. Try again.' : 'Could not decline. Try again.',
        }));
        return;
      }
      // The realtime stream drops the pending row and (on accept) adds the
      // commitment; this refresh just tightens the gap.
      void refresh();
    },
    [refresh],
  );

  const handleAccept = useCallback((item: Inbound) => void decide(item, 'accepted'), [decide]);
  const handleDecline = useCallback((item: Inbound) => void decide(item, 'passed'), [decide]);

  // Ruling 2: kind noun · date · amount. The status word is gone (only
  // 'accepted' renders) and the date is what tells two $12.50 orders apart.
  // Commitment noun (ENGAGEMENT_KIND_LABEL) per the Day 21 STOP-0 vocabulary:
  // engagement rows show the commitment noun, same as the Engagement tab.
  const chipLabel = (e: Engagement) => {
    const parts = [ENGAGEMENT_KIND_LABEL[e.kind]];
    if (e.scheduled_for) parts.push(formatForDisplay(e.scheduled_for, 'shortDate'));
    if (e.agreed_price_cents !== null) parts.push(formatCents(e.agreed_price_cents, e.currency));
    return parts.join(' · ');
  };
  const renderChip = (e: Engagement) => (
    <View key={e.id} style={styles.chip}>
      <Text style={styles.chipText}>{chipLabel(e)}</Text>
    </View>
  );

  // Ruling 3: the same accepted-unpaid row means "Awaiting payment" to its
  // seller and "Payment due" to its buyer. RLS guarantees the viewer is a
  // participant on every row, so seller-or-not is a complete split; both
  // groups can be non-empty at once when the pair trades in both directions.
  const sellerChips = myEntityId ? engagements.filter((e) => e.seller_entity_id === myEntityId) : [];
  const buyerChips = myEntityId ? engagements.filter((e) => e.seller_entity_id !== myEntityId) : [];
  const unknownRoleChips = myEntityId ? [] : engagements;

  if (pending.length === 0 && engagements.length === 0) return null;

  return (
    <View style={styles.slot}>
      {pending.map((item) => {
        const card = item.card_id ? (cards.find((c) => c.id === item.card_id) ?? null) : null;
        return (
          <DecisionPanel
            key={item.id}
            item={item}
            cardTitle={card?.title ?? null}
            cardTerms={card?.commerce_terms ?? null}
            priceCents={card?.price_cents ?? null}
            currency={card?.price_currency ?? 'usd'}
            busy={busyById[item.id] ?? null}
            error={errorById[item.id] ?? null}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        );
      })}
      {sellerChips.length > 0 ? (
        <View style={styles.chipGroup}>
          <Text style={styles.sectionLabel}>Awaiting payment</Text>
          <View style={styles.chipRow}>{sellerChips.map(renderChip)}</View>
        </View>
      ) : null}
      {buyerChips.length > 0 ? (
        <View style={styles.chipGroup}>
          {/* Labels only in this stop — the buyer's cancel is Day 22 item 5. */}
          <Text style={styles.sectionLabel}>Payment due</Text>
          <View style={styles.chipRow}>{buyerChips.map(renderChip)}</View>
        </View>
      ) : null}
      {unknownRoleChips.length > 0 ? (
        // Entity still loading — chips without a role label beat a wrong label.
        <View style={styles.chipRow}>{unknownRoleChips.map(renderChip)}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.hairline,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  panel: {
    // Wheat attention edge — highlight chrome, deliberately NOT the moss
    // action color the outgoing bubble wears.
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.accent2,
    backgroundColor: theme.colors.accent2Fill,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kindText: {
    ...theme.typography.caption,
    fontFamily: theme.fonts.semiBold,
    // Deep wheat — the TEXT-safe wheat (raw accent2 fails contrast on paper).
    color: theme.colors.accent2Deep,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  priceText: {
    ...theme.typography.body,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textPrimary,
  },
  titleText: {
    ...theme.typography.body,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textPrimary,
  },
  termsText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  declineBtn: {
    borderRadius: theme.borderRadius.card, // block shape — never the bubble pill
    borderWidth: 1,
    borderColor: theme.colors.textMuted,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    ...theme.typography.body,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textSecondary,
  },
  acceptBtn: {
    flex: 1, // full remaining width — an outgoing bubble never spans the row
    borderRadius: theme.borderRadius.card, // block shape — never the bubble pill
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    ...theme.typography.body,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.onAccent,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  errorText: {
    ...theme.typography.caption,
    color: theme.colors.danger,
  },
  chipGroup: {
    gap: theme.spacing.xs,
  },
  sectionLabel: {
    ...theme.typography.caption,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.accentWash,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  chipText: {
    ...theme.typography.caption,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.accent,
  },
});
