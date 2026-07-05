import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../styles/theme';
import type { Inbound, InboundKind } from '../types/inbound';

// A single Incoming tile: the "knock". Type-driven header, the sender's line,
// and a universal Accept / Decline pair (NO jargon). Accept opens an optional
// opening-line composer — that line becomes message #1 of the PlexChat thread.
// After a decision the buttons collapse into a coral receipt (amber, the warm
// confirm tone) so the action reads as acknowledged, not vanished.
//
// NOTE: saving a sender to the private rolodex lives in the PlexChat conversation
// header ("Add to contacts"), NOT here — the post-accept receipt was unreachable
// (Accept navigates to PlexChat before it paints; the pending-only Incoming list
// then unmounts the tile). See PlexChatScreen.AddContactButton.

const KIND_LABEL: Record<InboundKind, string> = {
  reach: 'Reach',
  booking: 'Booking',
  order: 'Order',
  message: 'Message',
};

type Outcome = 'accepted' | 'declined';

interface InboundTileProps {
  inbound: Inbound;
  // Returns a resolved promise on success; throws on failure (tile shows error).
  onAccept: (inbound: Inbound, body: string) => Promise<void>;
  onDecline: (inbound: Inbound) => Promise<void>;
}

export default function InboundTile({ inbound, onAccept, onDecline }: InboundTileProps) {
  const [composing, setComposing] = useState<boolean>(false);
  const [body, setBody] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [receipt, setReceipt] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      </View>

      <Text style={styles.message}>{inbound.message}</Text>

      {receipt ? (
        // The coral receipt — the acknowledged outcome. Saving the sender to the
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
              style={[styles.btn, styles.btnGhost]}
              onPress={() => setComposing(false)}
              disabled={busy}
            >
              <Text style={styles.btnGhostText}>Back</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
              onPress={accept}
              disabled={busy}
            >
              <Text style={styles.btnPrimaryText}>{busy ? 'Accepting…' : 'Accept'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.btn, styles.btnGhost, busy && styles.btnDisabled]}
            onPress={decline}
            disabled={busy}
          >
            <Text style={styles.btnGhostText}>Decline</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
            onPress={() => setComposing(true)}
            disabled={busy}
          >
            <Text style={styles.btnPrimaryText}>Accept</Text>
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
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
    fontWeight: '600',
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
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  btn: {
    borderRadius: theme.borderRadius.pill,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
    minWidth: 96,
  },
  btnPrimary: {
    backgroundColor: theme.colors.accent,
  },
  btnPrimaryText: {
    ...theme.typography.body,
    color: theme.colors.background,
    fontWeight: '600',
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: theme.colors.textMuted,
  },
  btnGhostText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  receiptRow: {
    borderRadius: theme.borderRadius.card,
    backgroundColor: 'rgba(212, 165, 116, 0.12)', // amber wash — the coral receipt
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  receiptText: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  errorText: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    marginTop: theme.spacing.sm,
  },
});
