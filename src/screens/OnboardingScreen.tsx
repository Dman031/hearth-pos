import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ConversationBubble from '../components/ConversationBubble';
import HearthOrb from '../components/HearthOrb';
import {
  classifyBusiness,
  type ClassificationResult,
} from '../services/classifier';
import { fetchAllTemplates, type Template } from '../services/template-loader';
import useVendor from '../hooks/useVendor';
import { theme } from '../styles/theme';

type OnboardingPhase =
  | 'greeting'
  | 'awaiting_description'
  | 'classifying'
  | 'confirming_category'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'manual_selection';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

interface ChatMessage {
  id: string;
  speaker: 'hearth' | 'vendor';
  text: string;
  isStreaming?: boolean;
}

interface OnboardingButton {
  label: string;
  onPress: () => void;
}

const CONFIDENCE_THRESHOLD = 0.7;
const GENERIC_SERVICE_ID = 'generic_service';

const GREETING_TEXT = 'Hey. Welcome to Hearth. What kind of work do you do?';
const SUCCESS_TEXT =
  'Great. Let me ask a few quick questions to set you up.';
const SAVE_ERROR_TEXT =
  'Something went sideways saving your account. Try again?';
const NETWORK_ERROR_TEXT =
  'Hold on — the network is hiccuping. Try again in a moment.';

/** The lead-in line when the choice falls to the vendor to make by hand. */
function manualPromptText(result: ClassificationResult): string {
  // A confidence of exactly 0 is the signature of a failed read (timeout,
  // unreadable response). A low-but-nonzero confidence is an honest guess.
  return result.confidence === 0
    ? 'Let me ask you directly: which of these fits best?'
    : 'I want to make sure I get this right. Which of these fits best?';
}

export default function OnboardingScreen() {
  const { createVendor } = useVendor();

  const [phase, setPhase] = useState<OnboardingPhase>('greeting');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftText, setDraftText] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [classification, setClassification] =
    useState<ClassificationResult | null>(null);
  const [chosenTemplateId, setChosenTemplateId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [templatesUnavailable, setTemplatesUnavailable] = useState(false);

  const messageIdCounter = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  const nextMessageId = (): string => {
    messageIdCounter.current += 1;
    return `msg-${messageIdCounter.current}`;
  };

  const addMessage = (
    speaker: 'hearth' | 'vendor',
    text: string,
    isStreaming = false,
  ): string => {
    const id = nextMessageId();
    setMessages((prev) => [...prev, { id, speaker, text, isStreaming }]);
    return id;
  };

  const updateMessage = (id: string, updates: Partial<ChatMessage>): void => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    );
  };

  // Opening line, shown once on mount, then the input opens.
  useEffect(() => {
    setMessages([
      { id: nextMessageId(), speaker: 'hearth', text: GREETING_TEXT },
    ]);
    setPhase('awaiting_description');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTemplates = async (): Promise<Template[]> => {
    try {
      const loaded = await fetchAllTemplates();
      setTemplates(loaded);
      return loaded;
    } catch (err) {
      console.warn('[OnboardingScreen] could not load business types:', err);
      setTemplates([]);
      return [];
    }
  };

  const presentResult = async (
    result: ClassificationResult,
    streamId: string,
  ): Promise<void> => {
    const loaded = await loadTemplates();
    const confident =
      result.confidence >= CONFIDENCE_THRESHOLD && !result.isFallback;

    if (confident) {
      const displayName =
        loaded.find((t) => t.id === result.category)?.display_name ??
        result.category;
      updateMessage(streamId, {
        text: `Got it — sounds like you run a ${displayName}. Did I get that right?`,
        isStreaming: false,
      });
      setPhase('awaiting_confirmation');
      return;
    }

    if (loaded.length === 0) {
      updateMessage(streamId, {
        text: NETWORK_ERROR_TEXT,
        isStreaming: false,
      });
      setTemplatesUnavailable(true);
    } else {
      updateMessage(streamId, {
        text: manualPromptText(result),
        isStreaming: false,
      });
      setTemplatesUnavailable(false);
    }
    setPhase('manual_selection');
  };

  const runClassification = async (
    text: string,
    streamId: string,
  ): Promise<void> => {
    setPhase('classifying');

    let result: ClassificationResult;
    try {
      result = await classifyBusiness(text);
    } catch (err) {
      // classifyBusiness is built not to throw; this is a defensive net.
      console.warn('[OnboardingScreen] classification threw:', err);
      result = {
        category: GENERIC_SERVICE_ID,
        confidence: 0,
        reasoning: 'unexpected_error',
        isFallback: true,
      };
    }

    setClassification(result);
    setPhase('confirming_category');
    await presentResult(result, streamId);
  };

  const handleSend = (): void => {
    const text = draftText.trim();
    if (text.length === 0) {
      return;
    }
    addMessage('vendor', text);
    const streamId = addMessage('hearth', '', true);
    setDraftText('');
    void runClassification(text, streamId);
  };

  const runCreateVendor = async (templateId: string): Promise<void> => {
    setSaveStatus('saving');
    const savingId = addMessage('hearth', '', true);
    try {
      await createVendor({ template_id: templateId });
      updateMessage(savingId, { text: SUCCESS_TEXT, isStreaming: false });
      setSaveStatus('saved');
    } catch (err) {
      console.warn('[OnboardingScreen] createVendor failed:', err);
      updateMessage(savingId, { text: SAVE_ERROR_TEXT, isStreaming: false });
      setSaveStatus('failed');
    }
  };

  const enterConfirmed = (templateId: string): void => {
    setChosenTemplateId(templateId);
    setPhase('confirmed');
    void runCreateVendor(templateId);
  };

  const handleConfirmYes = (): void => {
    if (!classification) {
      return;
    }
    enterConfirmed(classification.category);
  };

  const handleConfirmNo = async (): Promise<void> => {
    let loaded = templates;
    if (loaded.length === 0) {
      loaded = await loadTemplates();
    }
    if (loaded.length === 0) {
      addMessage('hearth', NETWORK_ERROR_TEXT);
      setTemplatesUnavailable(true);
    } else {
      addMessage(
        'hearth',
        'I want to make sure I get this right. Which of these fits best?',
      );
      setTemplatesUnavailable(false);
    }
    setPhase('manual_selection');
  };

  const handleManualSelect = (templateId: string): void => {
    enterConfirmed(templateId);
  };

  const handleRetryTemplates = async (): Promise<void> => {
    const loaded = await loadTemplates();
    if (loaded.length === 0) {
      return; // still down — leave the network-hiccup message in place
    }
    setTemplatesUnavailable(false);
    const lastMessage = messages[messages.length - 1];
    const prompt = classification
      ? manualPromptText(classification)
      : 'Which of these fits best?';
    if (lastMessage) {
      updateMessage(lastMessage.id, { text: prompt, isStreaming: false });
    }
  };

  const handleRetrySave = (): void => {
    if (!chosenTemplateId) {
      return;
    }
    void runCreateVendor(chosenTemplateId);
  };

  const handleContinue = (): void => {
    // Day 3 wires the per-business question loop and a real route here.
    console.log('TODO: Day 3 — template question loop');
  };

  const activeButtons = (): OnboardingButton[] | undefined => {
    switch (phase) {
      case 'awaiting_confirmation':
        return [
          { label: "Yes, that's right", onPress: handleConfirmYes },
          { label: 'Not quite', onPress: () => void handleConfirmNo() },
        ];
      case 'manual_selection':
        if (templatesUnavailable) {
          return [
            { label: 'Try again', onPress: () => void handleRetryTemplates() },
          ];
        }
        return [
          ...templates.map((t) => ({
            label: t.display_name,
            onPress: () => handleManualSelect(t.id),
          })),
          {
            label: 'None of these fit',
            onPress: () => handleManualSelect(GENERIC_SERVICE_ID),
          },
        ];
      case 'confirmed':
        if (saveStatus === 'saved') {
          return [{ label: 'Continue', onPress: handleContinue }];
        }
        if (saveStatus === 'failed') {
          return [{ label: 'Try again', onPress: handleRetrySave }];
        }
        return undefined;
      default:
        return undefined;
    }
  };

  const inputVisible =
    phase === 'greeting' || phase === 'awaiting_description';
  const canSend = draftText.trim().length > 0;
  const buttons = activeButtons();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.orbContainer}>
        <HearthOrb size={140} listening={phase === 'classifying'} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.conversation}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
        >
          {messages.map((message, index) => {
            const isLast = index === messages.length - 1;
            return (
              <ConversationBubble
                key={message.id}
                speaker={message.speaker}
                text={message.text}
                isStreaming={message.isStreaming}
                buttons={
                  isLast && message.speaker === 'hearth' ? buttons : undefined
                }
              />
            );
          })}
        </ScrollView>

        {inputVisible ? (
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={draftText}
              onChangeText={setDraftText}
              placeholder="Tell me about your work…"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <Pressable
              style={[
                styles.sendButton,
                !canSend && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!canSend}
            >
              <Text style={styles.sendIcon}>→</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  orbContainer: {
    alignItems: 'center',
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  conversation: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.input,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  sendButton: {
    width: theme.spacing.xxl,
    height: theme.spacing.xxl,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendIcon: {
    ...theme.typography.h2,
    color: theme.colors.background,
  },
});
