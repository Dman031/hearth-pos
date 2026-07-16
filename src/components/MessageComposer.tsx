import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../styles/theme';

// MessageComposer — the PlexChat send bar (16b item 1). Emits a TRIMMED body to
// onSend and clears the field. Whitespace-only input is treated as empty, so
// Send stays disabled. The parent owns the optimistic bubble + the post_message
// RPC call; this component is input-only and holds no network state.
interface MessageComposerProps {
  onSend: (body: string) => void;
}

export default function MessageComposer({ onSend }: MessageComposerProps) {
  const [value, setValue] = useState<string>('');
  const trimmed = value.trim();
  const canSend = trimmed.length > 0;

  const send = () => {
    if (!canSend) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <View style={styles.bar}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        placeholder="Message"
        placeholderTextColor={theme.colors.textMuted}
        multiline
      />
      <Pressable
        style={[styles.send, canSend ? styles.sendActive : styles.sendDisabled]}
        onPress={send}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSend }}
      >
        <Text style={[styles.sendLabel, !canSend && styles.sendLabelDisabled]}>Send</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.hairline,
  },
  input: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.input,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    maxHeight: 120,
  },
  send: {
    borderRadius: theme.borderRadius.pill,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendActive: {
    backgroundColor: theme.colors.accent,
  },
  sendDisabled: {
    backgroundColor: theme.colors.surfaceInset,
  },
  sendLabel: {
    ...theme.typography.body,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.onAccent,
  },
  sendLabelDisabled: {
    color: theme.colors.textMuted,
  },
});
