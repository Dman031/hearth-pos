import React, { useEffect } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '../styles/theme';

// Conversation actions are intentionally restricted to INPUT (carries a typed-
// or template-selection payload) or NAVIGATION (continue / try again / retry).
// A button must NEVER carry a binary decision (e.g. yes/no confirm). Onboarding
// models decisions as free-text replies that re-run classification — see
// src/screens/OnboardingScreen.tsx. The runtime guard below drops the trailing
// action and warns if a 2-action stack has no 'navigation' member, since that
// is the structural shape of a yes/no decision pair.
type ActionKind = 'input' | 'navigation';

interface ConversationAction {
  label: string;
  onPress: () => void;
  kind: ActionKind;
  tone?: 'default' | 'danger';
}

type BubbleTone = 'default' | 'danger';

interface ConversationBubbleProps {
  speaker: 'hearth' | 'vendor';
  text: string;
  actions?: ConversationAction[];
  isStreaming?: boolean;
  tone?: BubbleTone;
}

const ENTRANCE_DURATION_MS = 240;
const ENTRANCE_OFFSET = theme.spacing.sm; // 8px slide-up on mount
// No theme.borderRadius token for the 4px speech-bubble tail corner.
const TAIL_CORNER_RADIUS = 4;
const DOT_PULSE_DURATION_MS = 400;
const DOT_STAGGER_MS = 150;
const DOT_MIN_OPACITY = 0.3;
const VENDOR_BACKGROUND_OPACITY = 0.9;

function TypingDot({ delay }: { delay: number }) {
  const opacity = useSharedValue<number>(DOT_MIN_OPACITY);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: DOT_PULSE_DURATION_MS }), -1, true),
    );
  }, [opacity, delay]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.dot, dotStyle]} />;
}

function TypingIndicator() {
  return (
    <View style={styles.typingRow}>
      <TypingDot delay={0} />
      <TypingDot delay={DOT_STAGGER_MS} />
      <TypingDot delay={DOT_STAGGER_MS * 2} />
    </View>
  );
}

// Returns actions safe to render. If the stack looks like a yes/no decision
// pair (exactly two actions, neither tagged 'navigation'), drops the trailing
// action and warns loudly — the no-WIMP rule says decisions belong in the text
// channel, not in a button row. Fails loud but does not crash.
function guardActions(
  actions: ConversationAction[] | undefined,
): ConversationAction[] | undefined {
  if (!actions || actions.length === 0) {
    return actions;
  }
  if (
    actions.length === 2 &&
    actions.every((a) => a.kind !== 'navigation')
  ) {
    console.warn(
      '[ConversationBubble] refusing to render a 2-action stack where ' +
        "neither action is 'navigation' — this is the shape of a binary " +
        'decision and violates the no-WIMP rule. Dropping the trailing action.',
      actions.map((a) => `${a.kind}:${a.label}`),
    );
    return [actions[0]];
  }
  return actions;
}

export default function ConversationBubble({
  speaker,
  text,
  actions,
  isStreaming = false,
  tone = 'default',
}: ConversationBubbleProps) {
  const isVendor = speaker === 'vendor';
  const showTyping = isStreaming && speaker === 'hearth';
  const safeActions = guardActions(actions);

  const opacity = useSharedValue<number>(0);
  const translateY = useSharedValue<number>(ENTRANCE_OFFSET);

  useEffect(() => {
    let cancelled = false;

    const animateIn = () => {
      opacity.value = withTiming(1, { duration: ENTRANCE_DURATION_MS });
      translateY.value = withTiming(0, { duration: ENTRANCE_DURATION_MS });
    };
    const snapIn = () => {
      opacity.value = 1;
      translateY.value = 0;
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled) {
          return;
        }
        if (reduceMotion) {
          snapIn();
        } else {
          animateIn();
        }
      })
      .catch((err: unknown) => {
        console.warn(
          '[ConversationBubble] reduce-motion query failed; animating anyway:',
          err,
        );
        if (!cancelled) {
          animateIn();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [opacity, translateY]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const isDanger = !isVendor && tone === 'danger';

  return (
    <Animated.View
      style={[
        styles.row,
        isVendor ? styles.rowVendor : styles.rowHearth,
        entranceStyle,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isVendor ? styles.bubbleVendor : styles.bubbleHearth,
          isDanger ? styles.bubbleHearthDanger : null,
        ]}
      >
        {isVendor ? (
          <View
            style={[StyleSheet.absoluteFill, styles.vendorBackground]}
            pointerEvents="none"
          />
        ) : null}

        {showTyping ? (
          <TypingIndicator />
        ) : (
          <Text
            style={[
              styles.text,
              isVendor ? styles.textVendor : styles.textHearth,
              isDanger ? styles.textHearthDanger : null,
            ]}
          >
            {text}
          </Text>
        )}

        {safeActions && safeActions.length > 0 ? (
          <View style={styles.buttonStack}>
            {safeActions.map((action, index) => {
              const danger = action.tone === 'danger';
              return (
                <Pressable
                  key={`${index}-${action.label}`}
                  style={[
                    styles.button,
                    isVendor ? styles.buttonVendor : styles.buttonHearth,
                    danger ? styles.buttonDanger : null,
                  ]}
                  onPress={action.onPress}
                >
                  <Text
                    style={[
                      styles.buttonLabel,
                      isVendor
                        ? styles.buttonLabelVendor
                        : styles.buttonLabelHearth,
                      danger ? styles.buttonLabelDanger : null,
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

export type { ConversationAction, ActionKind, BubbleTone };

const styles = StyleSheet.create({
  row: {
    width: '100%',
    marginVertical: theme.spacing.sm,
  },
  rowHearth: {
    alignItems: 'flex-start',
  },
  rowVendor: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderTopLeftRadius: theme.borderRadius.card,
    borderTopRightRadius: theme.borderRadius.card,
    overflow: 'hidden',
  },
  bubbleHearth: {
    backgroundColor: theme.colors.surface,
    borderBottomRightRadius: theme.borderRadius.card,
    borderBottomLeftRadius: TAIL_CORNER_RADIUS,
  },
  bubbleHearthDanger: {
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  bubbleVendor: {
    borderBottomLeftRadius: theme.borderRadius.card,
    borderBottomRightRadius: TAIL_CORNER_RADIUS,
  },
  // Solid accent layer behind the vendor bubble's content. Kept as a separate
  // layer so the 90%-opacity applies to the fill only, never the text on top.
  vendorBackground: {
    backgroundColor: theme.colors.accent,
    opacity: VENDOR_BACKGROUND_OPACITY,
  },
  text: {
    ...theme.typography.body,
  },
  textHearth: {
    color: theme.colors.textPrimary,
  },
  textHearthDanger: {
    color: theme.colors.danger,
  },
  textVendor: {
    color: theme.colors.background,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  dot: {
    width: theme.spacing.sm,
    height: theme.spacing.sm,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.textSecondary,
  },
  buttonStack: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  button: {
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
  },
  buttonHearth: {
    borderColor: theme.colors.accent,
  },
  buttonVendor: {
    borderColor: theme.colors.background,
  },
  buttonDanger: {
    borderColor: theme.colors.danger,
  },
  buttonLabel: {
    ...theme.typography.body,
    fontWeight: '600',
  },
  buttonLabelHearth: {
    color: theme.colors.accent,
  },
  buttonLabelVendor: {
    color: theme.colors.background,
  },
  buttonLabelDanger: {
    color: theme.colors.danger,
  },
});
