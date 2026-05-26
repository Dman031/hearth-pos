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
import ConversationBubble, {
  type ConversationAction,
} from '../components/ConversationBubble';
import HearthOrb from '../components/HearthOrb';
import {
  classifyBusiness,
  type ClassificationResult,
} from '../services/classifier';
import { fetchAllTemplates, type Template } from '../services/template-loader';
import useVendor from '../hooks/useVendor';
import { theme } from '../styles/theme';

// Phase semantics:
//   greeting / awaiting_description — opening line + free-text input
//   classifying                     — LLM call in flight
//   narrating                       — high-confidence assumption presented;
//                                     held in pendingTemplateId. The vendor's
//                                     next message is run through the cheap
//                                     correction-router (once) before being
//                                     treated as a question-loop answer.
//   reclarifying                    — low-confidence first pass; ask one
//                                     prose follow-up before any pick-list
//   awaiting_clarification          — input visible during reclarify
//   question_loop                   — Day 3 per-template questions (placeholder)
//   manual_selection_exception      — DOCUMENTED EXCEPTION (see comment at
//                                     line ~290): the pick-list is shown ONLY
//                                     after two failed conversational passes
//                                     or a confidence===0 read.
//   finalizing                      — Pattern B: createVendor() runs here, at
//                                     the END of the loop, not at narration
//   confirmed                       — vendor row written; navigation continue
type OnboardingPhase =
  | 'greeting'
  | 'awaiting_description'
  | 'classifying'
  | 'narrating'
  | 'reclarifying'
  | 'awaiting_clarification'
  | 'question_loop'
  | 'manual_selection_exception'
  | 'finalizing'
  | 'confirmed';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

interface ChatMessage {
  id: string;
  speaker: 'hearth' | 'vendor';
  text: string;
  isStreaming?: boolean;
  // Bubble-level tone, used by the save-failure path to mark the error bubble.
  tone?: 'default' | 'danger';
}

const CONFIDENCE_THRESHOLD = 0.7;
const GENERIC_SERVICE_ID = 'generic_service';

const GREETING_TEXT = 'Hey. Welcome to Hearth. What kind of work do you do?';
const SAVE_ERROR_TEXT =
  'Something went sideways saving your account. Try again?';
const NETWORK_ERROR_TEXT =
  'Hold on — the network is hiccuping. Try again in a moment.';
const RECLARIFY_TEXT =
  "I want to get this right — tell me a bit more. What's a typical job " +
  'or customer look like for you?';

// Lightweight cues that the vendor's next message is correcting the
// just-narrated business type. The correction-router runs ONLY on the message
// immediately after narration; later messages are answers to the question
// loop. Cheap version per the approved spec — no classifier-on-every-turn.
const CORRECTION_CUES: readonly string[] = [
  'no',
  'nope',
  'not quite',
  "that's not",
  'thats not',
  "i'm not",
  'im not',
  "i don't",
  'i dont',
  'actually',
  'wrong',
  "you're off",
  'youre off',
  "you've got",
  'youve got',
];

function looksLikeCorrection(text: string): boolean {
  const lowered = text.trim().toLowerCase();
  if (lowered.length === 0) {
    return false;
  }
  // Match a cue only at the start of the message, or as a leading clause.
  return CORRECTION_CUES.some((cue) => {
    if (lowered === cue) {
      return true;
    }
    return lowered.startsWith(`${cue} `) || lowered.startsWith(`${cue},`);
  });
}

export default function OnboardingScreen() {
  const { createVendor } = useVendor();

  const [phase, setPhase] = useState<OnboardingPhase>('greeting');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftText, setDraftText] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(
    null,
  );
  const [pendingTemplateName, setPendingTemplateName] = useState<string | null>(
    null,
  );
  // Carries the latest classifier output; used only for diagnostics and for
  // the pick-list exception lead-in copy.
  const [lastClassification, setLastClassification] =
    useState<ClassificationResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [templatesUnavailable, setTemplatesUnavailable] = useState(false);
  // Tracks whether the next vendor message should be checked for a correction.
  // True only for the single turn immediately following a narration; flips
  // back to false once that message lands (whether it was a correction or an
  // answer). This is the "cheap correction-router" — exactly one classifier
  // re-run per onboarding, at most, in response to vendor text.
  const correctionWindowOpen = useRef(false);
  // Tracks whether the vendor has already gone through one low-confidence
  // reclarify pass. Pattern C says the pick-list appears only on the SECOND
  // failure (or on a hard-zero confidence read from the start).
  const reclarifyAttempted = useRef(false);

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
    tone: 'default' | 'danger' = 'default',
  ): string => {
    const id = nextMessageId();
    setMessages((prev) => [...prev, { id, speaker, text, isStreaming, tone }]);
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

  const displayNameFor = (
    categoryId: string,
    loaded: Template[],
  ): string => {
    return (
      loaded.find((t) => t.id === categoryId)?.display_name ?? categoryId
    );
  };

  // Renders the narration as a two-line message: a prominent name line, then
  // the soft correction invitation. The leading "▸ {Name}\n\n…" structure
  // makes the chosen business type the most visually salient element of the
  // bubble, mitigating silent ratification.
  const narrationText = (displayName: string): string => {
    return (
      `▸ ${displayName.toUpperCase()}\n\n` +
      `Setting you up for that now. If I read that wrong, just tell me ` +
      `what you actually do and I'll switch.`
    );
  };

  const reclarifyPromptText = (): string => RECLARIFY_TEXT;

  const pickListLeadIn = (result: ClassificationResult | null): string => {
    if (result === null || result.confidence === 0) {
      return 'Let me ask you directly: which of these fits best?';
    }
    return "I'm still not catching it — which of these fits best?";
  };

  // ---------------------------------------------------------------------------
  // Phase transitions driven by classification outcomes
  // ---------------------------------------------------------------------------

  // High-confidence outcome: narrate the assumption, hold the template id in
  // local state, and open the correction window for the vendor's next message.
  // Pattern B: NO createVendor call here.
  const enterNarrating = async (
    result: ClassificationResult,
    streamId: string,
  ): Promise<void> => {
    const loaded = await loadTemplates();
    const name = displayNameFor(result.category, loaded);
    setPendingTemplateId(result.category);
    setPendingTemplateName(name);
    updateMessage(streamId, {
      text: narrationText(name),
      isStreaming: false,
    });
    correctionWindowOpen.current = true;
    setPhase('narrating');
  };

  // Low-confidence first pass: ask one prose follow-up before any pick-list.
  // Pattern C, attempt 1.
  const enterReclarifying = (streamId: string): void => {
    reclarifyAttempted.current = true;
    updateMessage(streamId, {
      text: reclarifyPromptText(),
      isStreaming: false,
    });
    setPhase('awaiting_clarification');
  };

  // DOCUMENTED EXCEPTION — Pattern C fallback. The conversational principle
  // is that decisions are made by typing, not by tapping. The pick-list below
  // is the one place that rule bends, and only when:
  //   (a) the classifier returned confidence === 0 (a failed read — timeout,
  //       unreadable response), OR
  //   (b) the vendor has already been asked one prose follow-up and the
  //       classifier still can't land above CONFIDENCE_THRESHOLD.
  // Treating the pick-list as the default low-confidence path would be the
  // anti-pattern — by gating it behind a second strike we keep it as a
  // last-resort safety net, not a habit. Do not widen the conditions in
  // enterManualSelectionException without updating the BUGS_AND_SOLUTIONS
  // entry that records this rule.
  const enterManualSelectionException = async (
    result: ClassificationResult,
    streamId: string,
  ): Promise<void> => {
    const loaded = templates.length > 0 ? templates : await loadTemplates();
    if (loaded.length === 0) {
      updateMessage(streamId, {
        text: NETWORK_ERROR_TEXT,
        isStreaming: false,
      });
      setTemplatesUnavailable(true);
    } else {
      updateMessage(streamId, {
        text: pickListLeadIn(result),
        isStreaming: false,
      });
      setTemplatesUnavailable(false);
    }
    setPhase('manual_selection_exception');
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
      // classifyBusiness is built not to throw; defensive net.
      console.warn('[OnboardingScreen] classification threw:', err);
      result = {
        category: GENERIC_SERVICE_ID,
        confidence: 0,
        reasoning: 'unexpected_error',
        isFallback: true,
      };
    }

    setLastClassification(result);

    const confident =
      result.confidence >= CONFIDENCE_THRESHOLD && !result.isFallback;
    if (confident) {
      await enterNarrating(result, streamId);
      return;
    }

    // Pattern C fallback decision:
    //   - confidence === 0 is a failed read — go straight to the pick-list
    //   - otherwise low-but-nonzero: one prose reclarify, then pick-list on
    //     the SECOND failure (when reclarifyAttempted.current is already true)
    if (result.confidence === 0 || reclarifyAttempted.current) {
      await enterManualSelectionException(result, streamId);
      return;
    }
    enterReclarifying(streamId);
  };

  // ---------------------------------------------------------------------------
  // Input handler — branches on phase
  // ---------------------------------------------------------------------------

  const handleSend = (): void => {
    const text = draftText.trim();
    if (text.length === 0) {
      return;
    }

    // Correction-router runs ONLY on the message immediately after narration.
    // If the vendor types a correction here, re-run the classifier on their
    // new text and re-narrate (or fall through to Pattern C if it's now
    // low-confidence). Otherwise treat the message as a question-loop answer.
    if (phase === 'narrating' && correctionWindowOpen.current) {
      correctionWindowOpen.current = false;
      if (looksLikeCorrection(text)) {
        addMessage('vendor', text);
        const streamId = addMessage('hearth', '', true);
        setDraftText('');
        setPendingTemplateId(null);
        setPendingTemplateName(null);
        void runClassification(text, streamId);
        return;
      }
      // First non-correction reply after narration — the vendor has implicitly
      // ratified the template. Transition into the question loop and treat
      // this text as the first answer.
      addMessage('vendor', text);
      setDraftText('');
      setPhase('question_loop');
      // Day 3 will route this to the per-template question handler. For now,
      // the question loop has a single placeholder turn that immediately
      // surfaces the finalize affordance.
      enterPlaceholderQuestionLoop();
      return;
    }

    if (phase === 'awaiting_clarification') {
      addMessage('vendor', text);
      const streamId = addMessage('hearth', '', true);
      setDraftText('');
      void runClassification(text, streamId);
      return;
    }

    if (
      phase === 'greeting' ||
      phase === 'awaiting_description'
    ) {
      addMessage('vendor', text);
      const streamId = addMessage('hearth', '', true);
      setDraftText('');
      void runClassification(text, streamId);
      return;
    }

    // No other phase accepts free-text input; defensively no-op.
  };

  // Day 3 placeholder. The real per-template question loop lands separately;
  // for the no-WIMP onboarding ship this just acknowledges and surfaces the
  // navigation "Continue" affordance that triggers the deferred write.
  const enterPlaceholderQuestionLoop = (): void => {
    addMessage(
      'hearth',
      'Great. Day 3 wires up a few quick questions here — for now, ' +
        "I'll save your setup when you're ready.",
    );
  };

  // ---------------------------------------------------------------------------
  // Pattern B: deferred write — runs at the END of the loop, never at
  // classification time. Reads pendingTemplateId from state.
  // ---------------------------------------------------------------------------
  const runFinalize = async (): Promise<void> => {
    if (pendingTemplateId === null) {
      console.warn(
        '[OnboardingScreen] runFinalize called without a pendingTemplateId; ' +
          'phase=',
        phase,
      );
      return;
    }
    setPhase('finalizing');
    setSaveStatus('saving');
    const savingId = addMessage('hearth', '', true);
    try {
      await createVendor({ template_id: pendingTemplateId });
      updateMessage(savingId, {
        text: "You're all set. Welcome aboard.",
        isStreaming: false,
      });
      setSaveStatus('saved');
      setPhase('confirmed');
    } catch (err) {
      console.warn('[OnboardingScreen] createVendor failed:', err);
      updateMessage(savingId, {
        text: SAVE_ERROR_TEXT,
        isStreaming: false,
        tone: 'danger',
      });
      setSaveStatus('failed');
      // Stay in 'finalizing' so the retry navigation action surfaces.
    }
  };

  const handleFinalize = (): void => {
    void runFinalize();
  };

  // ---------------------------------------------------------------------------
  // Pick-list exception handler (DOCUMENTED EXCEPTION — see
  // enterManualSelectionException comment). Sets the held template id and
  // transitions straight into the placeholder question loop, so the deferred
  // write rule still holds: createVendor runs in runFinalize, not here.
  // ---------------------------------------------------------------------------
  const handleManualSelect = (
    templateId: string,
    name: string,
  ): void => {
    setPendingTemplateId(templateId);
    setPendingTemplateName(name);
    addMessage(
      'hearth',
      `Got it — setting you up for a ${name}.`,
    );
    setPhase('question_loop');
    enterPlaceholderQuestionLoop();
  };

  const handleRetryTemplates = async (): Promise<void> => {
    const loaded = await loadTemplates();
    if (loaded.length === 0) {
      return; // still down — leave the network-hiccup message in place
    }
    setTemplatesUnavailable(false);
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      updateMessage(lastMessage.id, {
        text: pickListLeadIn(lastClassification),
        isStreaming: false,
      });
    }
  };

  const handleRetrySave = (): void => {
    if (pendingTemplateId === null) {
      return;
    }
    void runFinalize();
  };

  const handleContinue = (): void => {
    // Day 3 wires the real route into the tab navigator here. With the
    // Context lift in place, Root will pick up the new vendor row automatically
    // once createVendor resolves; no extra hop is required from here.
    console.log('TODO: Day 3 — route to TabNavigator after finalize');
  };

  // ---------------------------------------------------------------------------
  // Active actions per phase. The shape of every entry is constrained by
  // ConversationAction.kind — input or navigation. No 'decision' kind exists.
  // ---------------------------------------------------------------------------
  const activeActions = (): ConversationAction[] | undefined => {
    switch (phase) {
      case 'question_loop':
        // Day 3 placeholder: surface the navigation that triggers Pattern B's
        // deferred write. Tagged 'navigation' because tapping it does not
        // encode a choice — it ends the (currently empty) question loop.
        if (pendingTemplateId !== null) {
          return [
            {
              label: 'Save and continue',
              onPress: handleFinalize,
              kind: 'navigation',
            },
          ];
        }
        return undefined;
      case 'manual_selection_exception':
        if (templatesUnavailable) {
          return [
            {
              label: 'Try again',
              onPress: () => void handleRetryTemplates(),
              kind: 'navigation',
            },
          ];
        }
        return [
          ...templates.map<ConversationAction>((t) => ({
            label: t.display_name,
            onPress: () => handleManualSelect(t.id, t.display_name),
            kind: 'input',
          })),
          {
            label: 'None of these fit',
            onPress: () =>
              handleManualSelect(GENERIC_SERVICE_ID, 'general service'),
            kind: 'input',
          },
        ];
      case 'finalizing':
        if (saveStatus === 'failed') {
          return [
            {
              label: 'Try again',
              onPress: handleRetrySave,
              kind: 'navigation',
              tone: 'danger',
            },
          ];
        }
        return undefined;
      case 'confirmed':
        if (saveStatus === 'saved') {
          return [
            {
              label: 'Continue',
              onPress: handleContinue,
              kind: 'navigation',
            },
          ];
        }
        return undefined;
      default:
        return undefined;
    }
  };

  // Input is visible whenever the next move is the vendor typing — that is
  // every phase where Hearth is waiting on the vendor's free-text reply,
  // including the narration window (vendor's correction OR question-loop
  // answer both arrive as typed text).
  const inputVisible =
    phase === 'greeting' ||
    phase === 'awaiting_description' ||
    phase === 'narrating' ||
    phase === 'awaiting_clarification';
  const canSend = draftText.trim().length > 0;
  const actions = activeActions();

  // The narration placeholder swaps in a softer correction prompt; everywhere
  // else, the original prompt is fine.
  const inputPlaceholder =
    phase === 'narrating' && pendingTemplateName !== null
      ? `Reply, or correct me if "${pendingTemplateName}" is off…`
      : 'Tell me about your work…';

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
                tone={message.tone}
                actions={
                  isLast && message.speaker === 'hearth' ? actions : undefined
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
              placeholder={inputPlaceholder}
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
