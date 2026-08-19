import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useCards from '../hooks/useCards';
import { countPastOrders } from '../context/CardContext';
import { formatForDisplay } from '../datetime';
import type { Card } from '../types/card';
import { theme } from '../styles/theme';

// RetiredCardsSheet — Day 22E ruling 4: the retired list is a SHEET, not a
// screen (CardEditorSheet's pageSheet pattern; Profile has no stack). Rows:
// title, "Retired {date}", and "{n} past orders" / "Never ordered". Restore is
// inline, ONE TAP, NO CONFIRM (ruling 6 — restoring is not destructive, and
// confirming reversible actions trains people to tap through the irreversible
// ones). Tapping a row opens the card in the editor, where Delete lives.

interface RetiredCardsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Opens the tapped retired card in the editor (Delete lives there). The
   *  Profile screen closes this sheet before opening the editor. */
  onOpenCard: (card: Card) => void;
}

export default function RetiredCardsSheet({
  visible,
  onClose,
  onOpenCard,
}: RetiredCardsSheetProps) {
  const { retiredCards, restoreCard } = useCards();
  // card_id → engagement count; null until the read resolves. A failed read
  // renders the count line as unknown — never as "Never ordered".
  const [orderCounts, setOrderCounts] = useState<Record<string, number> | null>(
    null,
  );
  const [countsFailed, setCountsFailed] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setOrderCounts(null);
    setCountsFailed(false);
    void (async () => {
      try {
        const counts = await countPastOrders(retiredCards.map((c) => c.id));
        if (!cancelled) setOrderCounts(counts);
      } catch (err) {
        console.error('[RetiredCardsSheet] order-count read failed:', err);
        if (!cancelled) setCountsFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, retiredCards]);

  const handleRestore = (card: Card) => {
    void (async () => {
      setRestoringId(card.id);
      try {
        // ONE TAP, NO CONFIRM (ruling 6). The row leaves this list as the
        // context repartitions; the card is back on the network.
        await restoreCard(card.id);
      } catch (err) {
        console.error('[RetiredCardsSheet] restore failed:', err);
      } finally {
        setRestoringId(null);
      }
    })();
  };

  const ordersLine = (card: Card): string => {
    if (countsFailed || orderCounts === null) return ' ';
    const n = orderCounts[card.id] ?? 0;
    if (n === 0) return 'Never ordered';
    return n === 1 ? '1 past order' : `${n} past orders`;
  };

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
          <Text style={styles.headerTitle}>Retired cards</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          {retiredCards.length === 0 ? (
            <Text style={styles.empty}>Nothing is retired.</Text>
          ) : (
            retiredCards.map((card) => (
              <Pressable
                key={card.id}
                style={styles.row}
                onPress={() => onOpenCard(card)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${card.title}`}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {card.title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {card.retired_at
                      ? `Retired ${formatForDisplay(card.retired_at, 'shortDate')}`
                      : 'Retired'}
                    {' · '}
                    {ordersLine(card)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleRestore(card)}
                  hitSlop={8}
                  disabled={restoringId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Restore ${card.title}`}
                  style={({ pressed }) => [
                    styles.restore,
                    pressed && styles.restorePressed,
                  ]}
                >
                  {restoringId === card.id ? (
                    <ActivityIndicator size="small" color={theme.colors.accent} />
                  ) : (
                    <Text style={styles.restoreLabel}>Restore</Text>
                  )}
                </Pressable>
              </Pressable>
            ))
          )}

          {retiredCards.length > 0 ? (
            <Text style={styles.hint}>
              A card that was never ordered from can be deleted for good — open
              it and use Delete.
            </Text>
          ) : null}
        </ScrollView>
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
  },
  headerTitle: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.semiBold,
  },
  done: {
    ...theme.typography.body,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  empty: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.hairline,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },
  rowMeta: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
  restore: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  restorePressed: {
    opacity: 0.6,
  },
  restoreLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
  },
  hint: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.lg,
  },
});
