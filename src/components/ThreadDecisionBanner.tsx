import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';
import { supabase } from '../services/supabase';
import useCards from '../hooks/useCards';
import useThreadPendingInbound from '../hooks/useThreadPendingInbound';
import useThreadEngagements from '../hooks/useThreadEngagements';
import { formatAcceptLabel, formatCents, KIND_LABEL, STATUS_LABEL } from '../utils/format';
import type { Inbound } from '../types/inbound';

// THE DECISION SLOT — "something in this conversation needs your decision",
// pinned above the composer (Day 21 STOP 4, the Josh fix). This is a SLOT, not
// a pending-inbound special case: today its only populating source is a
// pending knock addressed to the caller, because that is the only structured
// decision the network can put on a thread — but the 07-24 evidence shows the
// other shape (a repeat order arriving as prose creates no inbound row, so
// nothing renders here). When the network-side repeat-order fix lands, that
// source feeds this same slot; the slot's contract is "the union of decision
// sources on this thread", not "the inbound table". After a decision, the same
// slot carries the commitment status chips (Accepted → Paid → Done).
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
  const { engagements } = useThreadEngagements(threadId);
  const { cards } = useCards();
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
      {engagements.length > 0 ? (
        <View style={styles.chipRow}>
          {engagements.map((e) => {
            const cancelled = e.status === 'cancelled';
            const label =
              `${KIND_LABEL[e.kind]}` +
              (e.agreed_price_cents !== null ? ` ${formatCents(e.agreed_price_cents, e.currency)}` : '') +
              ` · ${STATUS_LABEL[e.status]}`;
            return (
              <View key={e.id} style={[styles.chip, cancelled && styles.chipCancelled]}>
                <Text style={[styles.chipText, cancelled && styles.chipTextCancelled]}>{label}</Text>
              </View>
            );
          })}
        </View>
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
  chipCancelled: {
    backgroundColor: theme.colors.surfaceInset,
  },
  chipText: {
    ...theme.typography.caption,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.accent,
  },
  chipTextCancelled: {
    color: theme.colors.textMuted,
  },
});
