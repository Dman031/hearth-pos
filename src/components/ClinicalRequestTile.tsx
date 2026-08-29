import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme, tileSurface } from '../styles/theme';
import { formatDayMonth, formatForDisplay, shortWeekday, toDateKey } from '../datetime';
import { formatCents } from '../utils/format';
import HonestyChips from './HonestyChips';
import Toast from './Toast';
import { postInquiryMessage, type PendingRequest } from '../services/inquiry';
import type { Inbound } from '../types/inbound';

// ClinicalRequestTile — PLEXMED S6 PART B, the clinician's tile for a request
// on a practice card.
//
// A SIBLING OF InboundTile, NOT A BRANCH INSIDE IT (ruling N-D). The shared
// Incoming tab survives a second vertical only if each vertical ADDS a
// registered component rather than another inline branch; InboundTile already
// kind-switches inline, and growing that switch by a whole clinical surface is
// what N-D exists to prevent.
//
// PRE-ACCEPT THE PERSON STAYS UNNAMED (S6-6). Nothing here renders a name,
// because get_my_pending_requests returns none — deliberately.
//
// ASKING IS NOT A STATE YOU LEAVE; IT IS A THING YOU DID. Accept and Decline
// stay available in T2 and T3. What changes is whether the composer is open.
//
// T4 REMOVES ACCEPT RATHER THAN DISABLING IT. A greyed Accept invites a tap
// that will be refused — the same reasoning as N-4.

interface ClinicalRequestTileProps {
  inbound: Inbound;
  /** Null when the chips read failed — chips are omitted, never guessed. */
  pending: PendingRequest | null;
  priceCents: number | null;
  currency: string;
  /** The practice's stored zone. Every time here carries it (VL-4). Undefined
   *  falls through to datetime's own default rather than to the device zone —
   *  a display site never resolves a zone itself. */
  tz?: string;
  onAccept: (inbound: Inbound, body: string) => Promise<void>;
  onDecline: (inbound: Inbound) => Promise<void>;
  onAsked: () => void;
}

export default function ClinicalRequestTile({
  inbound,
  pending,
  priceCents,
  currency,
  tz,
  onAccept,
  onDecline,
  onAsked,
}: ClinicalRequestTileProps) {
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const conversation = pending?.conversation ?? 'none';
  // The hold has lapsed once held_until is null. The conversation outlives it:
  // that is a real state, not an edge case.
  const heldUntil = pending?.held_until ?? null;
  const letGo = pending !== null && heldUntil === null;

  const acceptLabel =
    priceCents === null ? 'Accept' : `Accept — ${formatCents(priceCents, currency)}`;

  const ask = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const result = await postInquiryMessage(inbound.id, body);
    setBusy(false);
    if (!result.ok) {
      setToast(
        result.reason === 'awaiting_their_reply'
          ? 'Waiting on their answer.'
          : result.reason === 'already_decided'
            ? 'This request has already been answered.'
            : 'Couldn’t send that just now. Try again.',
      );
      return;
    }
    setBody('');
    setComposing(false);
    onAsked();
  }, [busy, inbound.id, body, onAsked]);

  const accept = useCallback(async () => {
    setBusy(true);
    try {
      await onAccept(inbound, '');
    } catch {
      // T-ERR. The time went while they were deciding — nothing was charged,
      // and the person can ask for another.
      setToast('That time went to someone else. They can ask for another; nothing was charged.');
    } finally {
      setBusy(false);
    }
  }, [inbound, onAccept]);

  return (
    <View style={styles.tile}>
      {pending ? (
        <HonestyChips
          idVerified={pending.sender_id_verified}
          firstContact={pending.first_contact}
          showDisclaimer
        />
      ) : null}

      {/* T2 / T3 / T4 banners. */}
      {letGo ? (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>That time was let go</Text>
          <Text style={styles.bannerBody}>
            A request holds a time for a day, or until an hour before the visit — whichever
            comes first. This one passed that point, so the time went back on your board. You
            can still talk here; to book, they need to ask for a time again.
          </Text>
        </View>
      ) : conversation === 'awaiting_them' ? (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>You asked a question · nothing is booked yet</Text>
          <Text style={styles.bannerBody}>
            {heldUntil
              ? `They can answer here. The time is still held until ${formatForDisplay(heldUntil, 'timeWithZone', tz)}.`
              : 'They can answer here.'}
          </Text>
        </View>
      ) : conversation === 'they_answered' ? (
        <View style={[styles.banner, styles.answered]}>
          <Text style={styles.bannerTitle}>They answered</Text>
        </View>
      ) : null}

      <Text style={styles.message}>{inbound.message}</Text>

      {/* The requested time. MODALITY IS ABSENT and that is not an oversight:
          neither `inbound` nor get_my_pending_requests carries it, and the
          column list is ruling S6-6. An omission, never a guess. */}
      {inbound.scheduled_for ? (
        <Text style={styles.timeRow}>
          {`${shortWeekday(toDateKey(inbound.scheduled_for, tz))} ${formatDayMonth(
            inbound.scheduled_for,
            tz,
          )} · ${formatForDisplay(inbound.scheduled_for, 'timeWithZone', tz)}`}
        </Text>
      ) : null}

      {heldUntil ? (
        <View>
          <Text style={styles.holdRow}>
            {`Held for them until ${formatForDisplay(heldUntil, 'timeWithZone', tz)}`}
          </Text>
          <Text style={styles.holdNote}>
            if you have not answered by then, the time goes back on your board.
          </Text>
        </View>
      ) : null}

      {composing ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={body}
            onChangeText={setBody}
            placeholder="Ask one question"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            editable={!busy}
          />
          <View style={styles.actionRow}>
            <Pressable onPress={() => setComposing(false)} disabled={busy} hitSlop={8}>
              <Text style={styles.textAction}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.outline, (busy || body.trim().length === 0) && styles.off]}
              disabled={busy || body.trim().length === 0}
              onPress={() => void ask()}
            >
              <Text style={styles.outlineLabel}>Send</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          {/* T4 removes Accept, never greys it. */}
          {!letGo ? (
            <Pressable
              style={[styles.accept, busy && styles.off]}
              disabled={busy}
              onPress={() => void accept()}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color={theme.colors.onAccent} />
              ) : (
                <Text style={styles.acceptLabel}>{acceptLabel}</Text>
              )}
            </Pressable>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable onPress={() => void onDecline(inbound)} disabled={busy} hitSlop={8}>
              <Text style={styles.textAction}>Decline</Text>
            </Pressable>
            {/* ONE QUESTION AT A TIME. Disabled while it is their turn — the
                composer describes the rule; the RPC guarantees it. */}
            <Pressable
              style={[styles.outline, conversation === 'awaiting_them' && styles.off]}
              disabled={conversation === 'awaiting_them'}
              onPress={() => setComposing(true)}
              accessibilityRole="button"
            >
              <Text style={styles.outlineLabel}>
                {conversation === 'none' ? 'Ask a question first' : 'Ask another'}
              </Text>
            </Pressable>
          </View>
          {conversation === 'awaiting_them' ? (
            <Text style={styles.helper}>Waiting on their answer.</Text>
          ) : null}
        </View>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { ...tileSurface, padding: theme.spacing.lg, gap: theme.spacing.md, marginBottom: theme.spacing.md },
  banner: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.card,
    backgroundColor: theme.colors.surfaceInset,
    gap: theme.spacing.xs,
  },
  answered: { backgroundColor: 'transparent', borderLeftWidth: 3, borderLeftColor: theme.colors.accent },
  bannerTitle: { ...theme.typography.bodyMuted, fontFamily: theme.fonts.semiBold, color: theme.colors.textPrimary },
  bannerBody: { ...theme.typography.caption, color: theme.colors.textSecondary },
  message: { ...theme.typography.body, color: theme.colors.textPrimary },
  timeRow: { ...theme.typography.body, color: theme.colors.textSecondary },
  holdRow: { ...theme.typography.bodyMuted, color: theme.colors.textSecondary },
  holdNote: { ...theme.typography.caption, color: theme.colors.textMuted, fontStyle: 'italic' },
  actions: { gap: theme.spacing.sm },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },
  accept: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.card,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  acceptLabel: { color: theme.colors.onAccent, fontFamily: theme.fonts.semiBold, fontSize: 16 },
  outline: {
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    borderRadius: theme.borderRadius.card,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  outlineLabel: { ...theme.typography.bodyMuted, color: theme.colors.accent, fontFamily: theme.fonts.semiBold },
  off: { opacity: 0.4 },
  textAction: { ...theme.typography.bodyMuted, color: theme.colors.textSecondary },
  helper: { ...theme.typography.caption, color: theme.colors.textMuted },
  composer: { gap: theme.spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.md,
    minHeight: 72,
    textAlignVertical: 'top',
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    backgroundColor: theme.colors.surface,
  },
});
