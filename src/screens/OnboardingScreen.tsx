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
import SignOutButton from '../components/SignOutButton';
import useCards from '../hooks/useCards';
import type { ActPerm, CardDraft, SeePerm } from '../types/card';
import { theme } from '../styles/theme';

// ============================================================================
// OnboardingScreen — the card-seeding helper (Phase 4 / Day 10).
//
// This is a SCRIPTED helper, not an agent. It asks a fixed sequence of plain
// questions, seeds 1–3 cards into the cards table, then hands off and never runs
// again (CardContext.needsOnboarding latch). It REPLACES the old LLM
// classify-business onboarding — there is no classification, no template, no
// Anthropic call here anymore. The "teacher wouldn't classify" bug is resolved
// by removing classification entirely (see DEFERRED.md).
//
// It reuses the existing conversational shell: ConversationBubble (typing dots +
// streaming), HearthOrb, the input bar, and the no-WIMP action model
// (kind: 'input' | 'navigation' only — never a binary decision pair).
//
// Editorial voice: spare, lowercase, human-first. Never the word "schema", never
// protocol/MCP terminology. Each step carries one plain-language "why this
// matters" line — especially permissions, framed as control, not configuration.
// ============================================================================

// Phase semantics:
//   mission             — opening mission lines, auto-paced, then the first ask
//   awaiting_card_title — vendor types the thing they want to be found for
//   awaiting_card_detail— optional one-line detail in their words (skippable)
//   awaiting_see        — privacy: who can SEE this card (input chips)
//   awaiting_act        — privacy: who can ACT on it (input chips)
//   saving_card         — createCard() in flight (the canonical gated write)
//   save_failed         — write failed; a retry navigation action is surfaced
//   offer_more          — offer another card (cap at MAX_CARDS) or finish
//   closing             — STATIC closing beat screen ("you're live")
type OnboardingPhase =
  | 'mission'
  | 'awaiting_card_title'
  | 'awaiting_card_detail'
  | 'awaiting_see'
  | 'awaiting_act'
  | 'saving_card'
  | 'save_failed'
  | 'offer_more'
  | 'closing';

interface ChatMessage {
  id: string;
  speaker: 'hearth' | 'vendor';
  text: string;
  isStreaming?: boolean;
  tone?: 'default' | 'danger';
}

// At most three cards in onboarding — keep it to ~3 minutes; the rest are added
// later from the Profile tab (Day 11–12).
const MAX_CARDS = 3;
// How long the typing indicator shows before a hearth line lands. Enough to feel
// paced and human without dragging.
const TYPING_MS = 650;

// --- copy -------------------------------------------------------------------
const MISSION_LINES: readonly string[] = [
  'we built this to connect people — not replace them.',
  "let's make you findable. takes about a minute.",
];

const CARD_QUESTION =
  "what's one thing you'd want someone — or someone's assistant — to be able " +
  'to find you for?' +
  '\n\nwhatever you say becomes a card — a small, findable thing about you.';

const DETAIL_QUESTION =
  'say a little more, in your own words.' +
  "\n\nit's what an agent reads when it's deciding whether to reach you. or " +
  'skip it.';

const SEE_QUESTION =
  'who can see this?' +
  '\n\nthis is how you stay in control — an agent can only do what you allow.';

const ACT_QUESTION =
  'and who can act on it?' +
  '\n\nacting means booking, buying, or starting something — not just looking.';

const OFFER_MORE_TEXT = 'added. want to add another thing people can find you for?';

const SAVE_ERROR_TEXT = "that didn't save. want to try again?";

// --- permission options (human label → enum) --------------------------------
// 'off' is intentionally omitted from SEE — you're declaring a card to be found,
// so the floor is "people I know". ACT starts at "no one" because most things
// people want to be reachable, not actionable, by default.
const SEE_OPTIONS: { label: string; value: SeePerm }[] = [
  { label: 'people I know', value: 'contacts' },
  { label: 'verified people', value: 'verified' },
  { label: 'anyone', value: 'anyone' },
];

const ACT_OPTIONS: { label: string; value: ActPerm }[] = [
  { label: 'no one — just reach out', value: 'off' },
  { label: 'people I know', value: 'contacts' },
  { label: 'verified people', value: 'verified' },
];

export default function OnboardingScreen() {
  const { createCard, completeOnboarding } = useCards();

  const [phase, setPhase] = useState<OnboardingPhase>('mission');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftText, setDraftText] = useState('');

  // The card currently being built. Reset between cards when "add another".
  const [pendingTitle, setPendingTitle] = useState('');
  const [pendingDetail, setPendingDetail] = useState<string | null>(null);
  const [pendingSee, setPendingSee] = useState<SeePerm>('contacts');

  const [cardsCreated, setCardsCreated] = useState(0);
  // The first card's title — the representative line in the closing beat.
  const [firstCardTitle, setFirstCardTitle] = useState<string | null>(null);

  const messageIdCounter = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  // Outstanding paced-bubble timers, cleared on unmount.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  // Shows the typing indicator for TYPING_MS, then lands a hearth line. Returns
  // a promise so scripted sequences read top-to-bottom.
  const sayHearth = (text: string): Promise<void> =>
    new Promise((resolve) => {
      const id = addMessage('hearth', '', true);
      const t = setTimeout(() => {
        updateMessage(id, { text, isStreaming: false });
        resolve();
      }, TYPING_MS);
      timers.current.push(t);
    });

  // Mission intro on mount → first card question. The entity + deus_id already
  // exist (EntitySetupScreen, Phase 3) by the time we get here, so we open
  // straight into the mission framing.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const line of MISSION_LINES) {
        if (cancelled) {
          return;
        }
        await sayHearth(line);
      }
      if (cancelled) {
        return;
      }
      await sayHearth(CARD_QUESTION);
      if (!cancelled) {
        setPhase('awaiting_card_title');
      }
    };
    void run();
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Free-text input handler — only the title and detail steps take typed input.
  // ---------------------------------------------------------------------------
  const handleSend = (): void => {
    const text = draftText.trim();
    if (text.length === 0) {
      return;
    }

    if (phase === 'awaiting_card_title') {
      setPendingTitle(text);
      addMessage('vendor', text);
      setDraftText('');
      void (async () => {
        await sayHearth(DETAIL_QUESTION);
        setPhase('awaiting_card_detail');
      })();
      return;
    }

    if (phase === 'awaiting_card_detail') {
      setPendingDetail(text);
      addMessage('vendor', text);
      setDraftText('');
      void (async () => {
        await sayHearth(SEE_QUESTION);
        setPhase('awaiting_see');
      })();
      return;
    }

    // No other phase accepts free-text; defensively no-op.
  };

  const handleSkipDetail = (): void => {
    setPendingDetail(null);
    addMessage('vendor', 'skip');
    void (async () => {
      await sayHearth(SEE_QUESTION);
      setPhase('awaiting_see');
    })();
  };

  const handleSelectSee = (option: { label: string; value: SeePerm }): void => {
    setPendingSee(option.value);
    addMessage('vendor', option.label);
    void (async () => {
      await sayHearth(ACT_QUESTION);
      setPhase('awaiting_act');
    })();
  };

  // Act is the last choice before the write — pass the value straight through
  // rather than reading freshly-set state.
  const handleSelectAct = (option: {
    label: string;
    value: ActPerm;
  }): void => {
    addMessage('vendor', option.label);
    void runSaveCard(option.value);
  };

  // ---------------------------------------------------------------------------
  // The canonical card write. createCard() runs the card-gating guard
  // (assertCardCanGoLive) and derives verification_status — see CardContext.
  // Onboarding cards declare verification_required: 'none', so the gate never
  // throws for a fresh unverified user, but the write still goes THROUGH it
  // (PROMPT-CODE CONTRACT).
  // ---------------------------------------------------------------------------
  const buildDraft = (act: ActPerm): CardDraft => ({
    title: pendingTitle,
    kind: 'capability',
    fields: pendingDetail ? { note: pendingDetail } : null,
    see_perm: pendingSee,
    act_perm: act,
    verification_required: 'none',
  });

  const runSaveCard = async (act: ActPerm): Promise<void> => {
    setPhase('saving_card');
    const savingId = addMessage('hearth', '', true);
    try {
      const created = await createCard(buildDraft(act));
      const count = cardsCreated + 1;
      setCardsCreated(count);
      if (firstCardTitle === null) {
        setFirstCardTitle(created.title);
      }

      // Reset the pending card for a possible next one.
      setPendingTitle('');
      setPendingDetail(null);
      setPendingSee('contacts');
      setDraftText('');

      if (count >= MAX_CARDS) {
        updateMessage(savingId, { text: 'added.', isStreaming: false });
        setPhase('closing');
        return;
      }
      updateMessage(savingId, { text: OFFER_MORE_TEXT, isStreaming: false });
      setPhase('offer_more');
    } catch (err) {
      console.warn('[OnboardingScreen] createCard failed:', err);
      updateMessage(savingId, {
        text: SAVE_ERROR_TEXT,
        isStreaming: false,
        tone: 'danger',
      });
      setPhase('save_failed');
    }
  };

  const handleRetrySave = (): void => {
    // The act value lived only in the failed call; rebuild from the last
    // act-question answer is overkill — re-run the see/act mini-flow instead by
    // re-asking act. Simplest correct path: bounce back to the act question.
    void (async () => {
      await sayHearth(ACT_QUESTION);
      setPhase('awaiting_act');
    })();
  };

  const handleAddAnother = (): void => {
    void (async () => {
      await sayHearth(CARD_QUESTION);
      setPhase('awaiting_card_title');
    })();
  };

  const handleDone = (): void => {
    setPhase('closing');
  };

  // Hand-off. completeOnboarding() clears the latch so Root advances to the
  // tabs and this helper never runs again.
  const handleEnterApp = (): void => {
    completeOnboarding();
  };

  // ---------------------------------------------------------------------------
  // Actions per phase. Permission chips are kind:'input' (carry a value);
  // offer/closing/retry are kind:'navigation'. No binary decision pairs.
  // ---------------------------------------------------------------------------
  const activeActions = (): ConversationAction[] | undefined => {
    switch (phase) {
      case 'awaiting_card_detail':
        return [
          {
            label: 'skip for now',
            onPress: handleSkipDetail,
            kind: 'navigation',
          },
        ];
      case 'awaiting_see':
        return SEE_OPTIONS.map<ConversationAction>((o) => ({
          label: o.label,
          onPress: () => handleSelectSee(o),
          kind: 'input',
        }));
      case 'awaiting_act':
        return ACT_OPTIONS.map<ConversationAction>((o) => ({
          label: o.label,
          onPress: () => handleSelectAct(o),
          kind: 'input',
        }));
      case 'save_failed':
        return [
          {
            label: 'try again',
            onPress: handleRetrySave,
            kind: 'navigation',
            tone: 'danger',
          },
        ];
      case 'offer_more':
        return [
          {
            label: 'add another',
            onPress: handleAddAnother,
            kind: 'navigation',
          },
          {
            label: "i'm done",
            onPress: handleDone,
            kind: 'navigation',
          },
        ];
      default:
        return undefined;
    }
  };

  // Input is visible only when the next move is the vendor typing.
  const inputVisible =
    phase === 'awaiting_card_title' || phase === 'awaiting_card_detail';
  const canSend = draftText.trim().length > 0;
  const actions = activeActions();

  const inputPlaceholder =
    phase === 'awaiting_card_detail'
      ? 'add a detail, or tap skip…'
      : 'in your own words…';

  // STATIC closing beat — one screen, using data we already have (the first
  // card's title). NO query_cards, NO live reach — that's Day 29 (DEFERRED.md).
  if (phase === 'closing') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.closingWrap}>
          <View style={styles.orbContainer}>
            <HearthOrb size={140} />
          </View>
          <Text style={styles.closingTitle}>you&apos;re now findable.</Text>
          {firstCardTitle ? (
            <Text style={styles.closingBody}>
              an AI can reach you for{' '}
              <Text style={styles.closingEmphasis}>{firstCardTitle}</Text>.
            </Text>
          ) : null}
          <Text style={styles.closingLive}>you&apos;re live.</Text>
          <Pressable style={styles.primaryButton} onPress={handleEnterApp}>
            <Text style={styles.primaryButtonLabel}>continue</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <SignOutButton />
      <View style={styles.orbContainer}>
        <HearthOrb size={140} listening={phase === 'saving_card'} />
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
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
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
  // --- closing beat ---------------------------------------------------------
  closingWrap: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closingTitle: {
    ...theme.typography.h1,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
  closingBody: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
  },
  closingEmphasis: {
    color: theme.colors.accent,
  },
  closingLive: {
    ...theme.typography.h2,
    color: theme.colors.accent,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xxl,
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.input,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonLabel: {
    ...theme.typography.body,
    color: theme.colors.background,
    fontWeight: '600',
  },
});
