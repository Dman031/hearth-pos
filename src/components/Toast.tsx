import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';

// Toast — a transient line, dismissed by time rather than by the person.
//
// WHY NOT Alert.alert, WHICH THIS APP OTHERWISE USES. Alert is the confirm
// idiom: it interrupts, and it demands a tap before anything continues. The
// three messages this serves are ACKNOWLEDGEMENTS, not decisions — "Posted 6
// times. 2 were already on your board", "someone has asked for this time" —
// and putting a modal in front of a clinician to tell them something already
// happened makes a receipt feel like a problem.
//
// Deliberately not animated and not portalled. It renders inside the surface
// that raised it, which keeps it beside the thing it describes and avoids a
// root-level overlay this app has no other use for.

/** How long a toast stays up. Long enough to read twice, short enough to ignore. */
export const TOAST_MS = 4000;

interface ToastProps {
  /** null hides it. Setting a new message restarts the timer. */
  message: string | null;
  onDismiss: () => void;
  /** Danger tint for a refusal; the default reads as a receipt. */
  tone?: 'default' | 'danger';
}

export default function Toast({ message, onDismiss, tone = 'default' }: ToastProps) {
  useEffect(() => {
    if (message === null) return;
    const t = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (message === null) return null;
  return (
    <View
      style={[styles.toast, tone === 'danger' && styles.danger]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    backgroundColor: theme.colors.surfaceInset,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  danger: { borderColor: theme.colors.danger },
  text: { ...theme.typography.bodyMuted, color: theme.colors.textSecondary },
});
