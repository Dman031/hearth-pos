import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '../styles/theme';
import { formatCents, ENGAGEMENT_KIND_LABEL } from '../utils/format';
import { formatForDisplay } from '../datetime';
import type { InboundKind } from '../types/inbound';
import type { SettledPayment } from '../types/settled-payment';
import useMoneyBalance from '../hooks/useMoneyBalance';
import useSettledPayments from '../hooks/useSettledPayments';
import { refundPayment } from '../services/money';

// MoneyPanel — the Money surface as an EMBEDDED sheet panel (Day 22B),
// following the ContactsPanel pattern (navigation-free, lives inside
// AccountChip's sheet). Two sections, nothing more:
//   BALANCE — available / pending / next payout, from the Worker's
//     /money/balance (the app's session as Bearer — the second token plane,
//     CLAUDE.md "Token planes"). payments_ready:false renders the honest
//     not-set-up state; no payout date is ever fabricated.
//   SETTLED — the ledger via get_my_settled_payments (0027, direct RPC).
//     Refunded rows stay visible, marked, struck through — never hidden.
//     Tap a row → detail; Refund lives in the detail with ONE confirm.
//
// Refund writes NOTHING app-side: the Worker calls Stripe, the payments
// webhook finalizes the row. The gap between the two is bridged by
// useSettledPayments.markRefunded's session-local overlay (see that hook).

/** Peer label: real name, else public id, else fallback (ContactsPanel style). */
function peerLabel(p: SettledPayment): string {
  if (p.peer_display_name && p.peer_display_name.trim().length > 0) {
    return p.peer_display_name;
  }
  if (p.peer_deus_id && p.peer_deus_id.trim().length > 0) return `#${p.peer_deus_id}`;
  return 'Customer';
}

/** The vendor-facing noun for what was paid for (never the schema term). */
function kindNoun(kind: string | null): string {
  if (kind && kind in ENGAGEMENT_KIND_LABEL) {
    return ENGAGEMENT_KIND_LABEL[kind as InboundKind];
  }
  return 'Payment';
}

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "YYYY-MM-DD" (a calendar date, not an instant) → "Aug 15". Pure string
 * pieces — no Date, no timezone math (DATE/TIME RULE: a date-only value has
 * no instant to convert; parsing it through Date would shift it a day). */
function payoutDateLabel(d: string): string {
  const [, m, day] = d.split('-').map((s) => Number(s));
  if (!m || !day || m < 1 || m > 12) return d;
  return `${MONTH_SHORT[m - 1]} ${day}`;
}

function amountsLabel(entries: { amount_cents: number; currency: string }[]): string {
  if (entries.length === 0) return formatCents(0, 'usd');
  return entries.map((e) => formatCents(e.amount_cents, e.currency)).join(' · ');
}

// ---------------------------------------------------------------------------
// BALANCE section
// ---------------------------------------------------------------------------

function BalanceSection() {
  const { balance, isLoading, failure } = useMoneyBalance();

  let body: React.ReactElement;
  if (isLoading) {
    body = <ActivityIndicator color={theme.colors.accent} />;
  } else if (failure === 'session_expired' || failure === 'unauthenticated') {
    // An auth outcome, not a money outcome — say so.
    body = (
      <Text style={styles.muted}>
        Your session has expired. Sign in again to see your money.
      </Text>
    );
  } else if (failure) {
    body = <Text style={styles.muted}>Couldn’t load your balance right now.</Text>;
  } else if (balance && !balance.payments_ready) {
    body = (
      <Text style={styles.muted}>
        Payments aren’t set up yet. Turn on selling from one of your cards to
        finish setup.
      </Text>
    );
  } else if (balance) {
    const payoutLine = balance.next_payout_date
      ? `Next payout ${payoutDateLabel(balance.next_payout_date)}`
      : 'No payouts yet';
    body = (
      <>
        <Text style={styles.balanceHeadline}>{amountsLabel(balance.available)}</Text>
        <Text style={styles.balanceLabel}>Available</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.muted}>Pending {amountsLabel(balance.pending)}</Text>
          <Text style={styles.muted}>{payoutLine}</Text>
        </View>
      </>
    );
  } else {
    body = <Text style={styles.muted}>Couldn’t load your balance right now.</Text>;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Balance</Text>
      {body}
    </View>
  );
}

// ---------------------------------------------------------------------------
// SETTLED list + detail
// ---------------------------------------------------------------------------

function SettledRow({ item, onPress }: { item: SettledPayment; onPress: () => void }) {
  const refunded = item.status === 'refunded';
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{peerLabel(item)}</Text>
        <Text style={styles.rowMeta}>
          {formatForDisplay(item.created_at, 'shortDate')} · {kindNoun(item.kind)} · fee{' '}
          {formatCents(item.fee_cents, item.currency)}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowAmount, refunded && styles.struck]}>
          {formatCents(item.amount_cents, item.currency)}
        </Text>
        {refunded ? <Text style={styles.refundedTag}>Refunded</Text> : null}
      </View>
    </Pressable>
  );
}

function DetailView({
  payment,
  onBack,
  onRefunded,
}: {
  payment: SettledPayment;
  onBack: () => void;
  onRefunded: (transactionId: string) => void;
}) {
  const [refunding, setRefunding] = useState(false);
  const refunded = payment.status === 'refunded';
  const amount = formatCents(payment.amount_cents, payment.currency);
  const net = formatCents(
    payment.amount_cents - payment.fee_cents,
    payment.currency,
  );
  const fee = formatCents(payment.fee_cents, payment.currency);

  const issueRefund = async () => {
    setRefunding(true);
    const result = await refundPayment(payment.transaction_id);
    setRefunding(false);
    if (result.ok) {
      // 'already_refunded' is a success, not an error — the money is already
      // on its way back; the ledger catches up when the webhook lands.
      onRefunded(payment.transaction_id);
      if (result.outcome === 'already_refunded') {
        Alert.alert(
          'Already refunded',
          'This payment was already refunded — nothing more to do.',
        );
      }
      return;
    }
    if (result.reason === 'session_expired' || result.reason === 'unauthenticated') {
      Alert.alert('Session expired', 'Sign in again to manage your money.');
    } else if (result.reason === 'not_refundable') {
      Alert.alert('Can’t refund', 'This payment can’t be refunded.');
    } else {
      Alert.alert(
        'Refund didn’t go through',
        'Nothing was changed. Try again in a moment.',
      );
    }
  };

  const confirmRefund = () => {
    // ONE confirm, no ceremony — a normal vendor action.
    Alert.alert(
      `Refund ${amount} to ${peerLabel(payment)}?`,
      'Stripe’s card-processing fee isn’t returned.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Refund', style: 'destructive', onPress: () => void issueRefund() },
      ],
    );
  };

  return (
    <View>
      <Pressable style={styles.backRow} onPress={onBack} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.back}>‹ Money</Text>
      </Pressable>
      <Text style={[styles.detailAmount, refunded && styles.struck]}>{amount}</Text>
      <Text style={refunded ? styles.refundedTag : styles.detailStatus}>
        {refunded
          ? 'Refunded'
          : `Paid ${formatForDisplay(payment.created_at, 'date')}`}
      </Text>

      <View style={styles.detailBlock}>
        <Text style={styles.detailLine}>From {peerLabel(payment)}</Text>
        <Text style={styles.detailLine}>{kindNoun(payment.kind)}</Text>
        {payment.scheduled_for ? (
          <Text style={styles.detailLine}>
            Due {formatForDisplay(payment.scheduled_for, 'datetime')}
          </Text>
        ) : null}
        {!refunded ? (
          <Text style={styles.detailLineMuted}>
            You keep {net} after the {fee} fee.
          </Text>
        ) : null}
      </View>

      {!refunded ? (
        <Pressable
          style={[styles.refundButton, refunding && styles.refundButtonBusy]}
          onPress={confirmRefund}
          disabled={refunding}
          accessibilityRole="button"
        >
          {refunding ? (
            <ActivityIndicator color={theme.colors.danger} />
          ) : (
            <Text style={styles.refundButtonLabel}>Refund {amount}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function MoneyPanel() {
  const { payments, isLoading, error, hasMore, loadMore, markRefunded } =
    useSettledPayments();
  const [detail, setDetail] = useState<SettledPayment | null>(null);

  if (detail) {
    // Keep the detail view live against the overlay (refund flips status).
    const current =
      payments.find((p) => p.transaction_id === detail.transaction_id) ?? detail;
    return (
      <DetailView
        payment={current}
        onBack={() => setDetail(null)}
        onRefunded={markRefunded}
      />
    );
  }

  let settledBody: React.ReactElement;
  if (isLoading && payments.length === 0) {
    settledBody = (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  } else if (error && payments.length === 0) {
    settledBody = (
      <View style={styles.centered}>
        <Text style={styles.muted}>Couldn’t load right now.</Text>
      </View>
    );
  } else if (payments.length === 0) {
    settledBody = (
      <View style={styles.centered}>
        <Text style={styles.muted}>No payments yet.</Text>
      </View>
    );
  } else {
    settledBody = (
      <FlatList
        style={styles.list}
        data={payments}
        keyExtractor={(item) => item.transaction_id}
        renderItem={({ item }) => (
          <SettledRow item={item} onPress={() => setDetail(item)} />
        )}
        ListFooterComponent={
          hasMore ? (
            <Pressable
              style={styles.moreRow}
              onPress={() => void loadMore()}
              accessibilityRole="button"
            >
              <Text style={styles.moreLabel}>Show more</Text>
            </Pressable>
          ) : null
        }
      />
    );
  }

  return (
    <View>
      <BalanceSection />
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Settled</Text>
        {settledBody}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: theme.spacing.md,
  },
  sectionLabel: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: theme.spacing.sm,
  },
  balanceHeadline: {
    ...theme.typography.h1,
    color: theme.colors.textPrimary,
  },
  balanceLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  muted: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.lg,
  },
  list: {
    // Cap the sheet's growth; the ledger scrolls inside it (ContactsPanel).
    maxHeight: 300,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.hairline,
  },
  rowMain: {
    flexShrink: 1,
    paddingRight: theme.spacing.md,
  },
  rowName: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.semiBold,
  },
  rowMeta: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowAmount: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.semiBold,
  },
  struck: {
    textDecorationLine: 'line-through',
    color: theme.colors.textMuted,
  },
  refundedTag: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    fontFamily: theme.fonts.semiBold,
    marginTop: 2,
  },
  moreRow: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  moreLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
  },
  backRow: {
    paddingVertical: theme.spacing.xs,
  },
  back: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
  },
  detailAmount: {
    ...theme.typography.h1,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.sm,
  },
  detailStatus: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  detailBlock: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  detailLine: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },
  detailLineMuted: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  refundButton: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  refundButtonBusy: {
    opacity: 0.7,
  },
  refundButtonLabel: {
    ...theme.typography.body,
    color: theme.colors.danger,
    fontFamily: theme.fonts.semiBold,
  },
});
