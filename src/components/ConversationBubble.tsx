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

interface ConversationButton {
  label: string;
  onPress: () => void;
}

interface ConversationBubbleProps {
  speaker: 'hearth' | 'vendor';
  text: string;
  buttons?: ConversationButton[];
  isStreaming?: boolean;
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

export default function ConversationBubble({
  speaker,
  text,
  buttons,
  isStreaming = false,
}: ConversationBubbleProps) {
  const isVendor = speaker === 'vendor';
  const showTyping = isStreaming && speaker === 'hearth';

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
            ]}
          >
            {text}
          </Text>
        )}

        {buttons && buttons.length > 0 ? (
          <View style={styles.buttonStack}>
            {buttons.map((button, index) => (
              <Pressable
                key={`${index}-${button.label}`}
                style={[
                  styles.button,
                  isVendor ? styles.buttonVendor : styles.buttonHearth,
                ]}
                onPress={button.onPress}
              >
                <Text
                  style={[
                    styles.buttonLabel,
                    isVendor
                      ? styles.buttonLabelVendor
                      : styles.buttonLabelHearth,
                  ]}
                >
                  {button.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

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
});
