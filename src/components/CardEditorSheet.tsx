import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Card } from '../types/card';
import useCards from '../hooks/useCards';
import { fieldsToPersist, normalizeFields, type FieldEntry } from '../utils/card-fields';
import { theme } from '../styles/theme';

// CardEditorSheet — Profile part 1 editor. Rename a card and add / name / remove
// its user-named fields. Save writes title + fields via CardContext.updateCard,
// which re-embeds fire-and-forget. Editing permissions / flavor / delete is Day 12.
//
// A legacy {note} card opens with one field labeled "note"; saving persists the
// canonical [{label,value}] array — the planned blob→structured upgrade.

interface CardEditorSheetProps {
  card: Card | null; // the card being edited; null = closed
  onClose: () => void;
}

export default function CardEditorSheet({ card, onClose }: CardEditorSheetProps) {
  const { updateCard } = useCards();
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<FieldEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed local state whenever a different card opens.
  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setFields(normalizeFields(card.fields));
      setError(null);
    }
  }, [card]);

  const visible = card !== null;
  const canSave = title.trim().length > 0 && !saving;

  const setField = (index: number, patch: Partial<FieldEntry>): void => {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  };

  const addField = (): void => {
    setFields((prev) => [...prev, { label: '', value: '' }]);
  };

  const removeField = (index: number): void => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (): Promise<void> => {
    if (!card || !canSave) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateCard(card.id, {
        title: title.trim(),
        fields: fieldsToPersist(fields),
      });
      onClose();
    } catch (err) {
      console.warn('[CardEditorSheet] save failed:', err);
      setError("That didn't save. Try again?");
    } finally {
      setSaving(false);
    }
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
          <Pressable onPress={onClose} hitSlop={8} disabled={saving}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Edit card</Text>
          <Pressable onPress={() => void handleSave()} hitSlop={8} disabled={!canSave}>
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Text style={[styles.save, !canSave && styles.saveDisabled]}>Save</Text>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>Title</Text>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="what you want to be found for"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Text style={[styles.sectionLabel, styles.fieldsHeading]}>Details</Text>
            {fields.length === 0 ? (
              <Text style={styles.emptyHint}>
                No details yet. Add a few so people — and their assistants — know more.
              </Text>
            ) : null}

            {fields.map((f, i) => (
              <View key={i} style={styles.fieldCard}>
                <View style={styles.fieldHeaderRow}>
                  <TextInput
                    style={styles.fieldLabelInput}
                    value={f.label}
                    onChangeText={(t) => setField(i, { label: t })}
                    placeholder="name (e.g. where)"
                    placeholderTextColor={theme.colors.textMuted}
                    autoCapitalize="none"
                  />
                  <Pressable
                    onPress={() => removeField(i)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove field ${f.label || i + 1}`}
                  >
                    <Text style={styles.removeField}>Remove</Text>
                  </Pressable>
                </View>
                <TextInput
                  style={styles.fieldValueInput}
                  value={f.value}
                  onChangeText={(t) => setField(i, { value: t })}
                  placeholder="value (in your words)"
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                />
              </View>
            ))}

            <Pressable
              style={({ pressed }) => [styles.addField, pressed && styles.addFieldPressed]}
              onPress={addField}
              accessibilityRole="button"
              accessibilityLabel="Add a field"
            >
              <Text style={styles.addFieldLabel}>+ Add a field</Text>
            </Pressable>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
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
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surface,
  },
  headerTitle: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  cancel: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  save: {
    ...theme.typography.body,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  saveDisabled: {
    opacity: 0.4,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  sectionLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
  fieldsHeading: {
    marginTop: theme.spacing.lg,
  },
  titleInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  emptyHint: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xs,
  },
  fieldCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  fieldLabelInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    paddingVertical: theme.spacing.xs,
  },
  removeField: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    fontWeight: '600',
  },
  fieldValueInput: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.bodyMuted.fontSize,
    paddingVertical: theme.spacing.xs,
    minHeight: 24,
  },
  addField: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    marginTop: theme.spacing.sm,
  },
  addFieldPressed: {
    opacity: 0.6,
  },
  addFieldLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  errorText: {
    ...theme.typography.bodyMuted,
    color: theme.colors.danger,
    marginTop: theme.spacing.md,
  },
});
