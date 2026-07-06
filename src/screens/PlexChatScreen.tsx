import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { theme } from '../styles/theme';
import { supabase } from '../services/supabase';
import useEntity from '../hooks/useEntity';
import useThreadMessages from '../hooks/useThreadMessages';
import usePostMessage from '../hooks/usePostMessage';
import useMarkThreadRead from '../hooks/useMarkThreadRead';
import useThreadPeer from '../hooks/useThreadPeer';
import useContacts from '../hooks/useContacts';
import ConversationBubble from '../components/ConversationBubble';
import MessageComposer from '../components/MessageComposer';
import type { Message } from '../types/message';

// PlexChatScreen — the conversation that follows an accepted knock. 16b item 1
// makes it TWO-WAY: a compose bar sends via the canonical post_message RPC with
// an OPTIMISTIC bubble that reconciles against the 16a realtime stream
// (useThreadMessages). The RPC derives the sender server-side from auth.uid()
// (anti-spoof); the app NEVER passes from_entity_id and NEVER inserts into
// `messages` directly (RLS permits no client insert — the RPC is the only write
// path). My messages render as the amber 'vendor' bubble (right); the other
// party as the 'hearth' surface bubble (left).

// Window within which a canonical row counts as the body-match "twin" of an
// optimistic send. id-match is primary and precise; this bounded body-match is
// the fallback (and the only signal when an RPC error hid the real message_id).
const RECENT_TWIN_MS = 5 * 60 * 1000;

interface PendingMessage {
  tempId: string;
  body: string;
  status: 'sending' | 'failed';
  realId: string | null; // message_id from a successful RPC; enables precise id-match
}

type Row =
  | { kind: 'message'; key: string; body: string; mine: boolean }
  | { kind: 'pending'; key: string; tempId: string; body: string; status: 'sending' | 'failed' };

// Header-right "Add to contacts": saves the OTHER participant to the owner's
// private rolodex (add_contact RPC, 0012). This is the ONLY reachable entry point
// for saving a contact — the old Incoming-receipt affordance was dead-on-arrival
// (Accept navigates here before it paints and the pending-only list unmounts it).
// The owner is derived SERVER-SIDE (current_entity_id); we pass ONLY the peer id.
// add_contact is on-conflict-do-nothing, so a re-save is a success, not an error.
// Saving grants NO reach — a private list entry only (17A firewall).
//
// PRESENTATIONAL only: saved-truth is DB-derived by the parent (useContacts ⇒
// isContact) and persists across leaving/re-entering the thread — iMessage-style.
// This component holds NO per-mount state; a remount reads the same derived
// `saved` and never forgets. When saved it renders a NON-tappable muted marker.
function AddContactButton({
  peerEntityId,
  saved,
  onAdd,
}: {
  peerEntityId: string | null;
  saved: boolean;
  onAdd: () => void;
}) {
  // No peer resolved yet (thread still loading) — nothing to save.
  if (!peerEntityId) return null;

  if (saved) {
    // Non-tappable, muted — not a button. Reuses the "done" header style.
    return <Text style={[styles.headerAction, styles.headerActionDone]}>✓ In Contacts</Text>;
  }

  return (
    <Pressable onPress={onAdd} hitSlop={8} accessibilityRole="button">
      <Text style={styles.headerAction}>Add to contacts</Text>
    </Pressable>
  );
}

export default function PlexChatScreen() {
  const route = useRoute<{ key: string; name: string; params?: { threadId?: string; title?: string } }>();
  const threadId = route.params?.threadId ?? null;
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<{
    setOptions: (o: { title?: string; headerRight?: () => React.ReactNode }) => void;
  }>();
  const { entity } = useEntity();
  const myEntityId = entity?.id ?? null;
  const { messages, isLoading, error } = useThreadMessages(threadId);
  const { postMessage } = usePostMessage();
  const { markThreadRead } = useMarkThreadRead();
  const { name: peerName, entityId: peerEntityId } = useThreadPeer(threadId);

  // Saved-contact truth is DB-DERIVED, not per-mount state: the same useContacts
  // hook the Contacts tab uses (get_my_contacts on focus) is the source of saved-
  // truth, so "✓ In Contacts" persists across leaving/re-entering the thread.
  const { contacts, refresh: refreshContacts } = useContacts();
  const [optimisticallyAdded, setOptimisticallyAdded] = useState(false);
  const isContact = !!peerEntityId && contacts.some((c) => c.contact_entity_id === peerEntityId);
  // Displayed saved-state = DB truth OR the optimistic flip (instant feedback only).
  const savedAsContact = isContact || optimisticallyAdded;

  // Tap handler: optimistic flip → add_contact (owner server-derived, peer id only)
  // → refresh so isContact becomes true from DB truth. On error revert + log (no
  // silent catch) so the vendor can retry. Reconcile makes the optimistic bool moot.
  const handleAddContact = useCallback(async () => {
    if (!peerEntityId || savedAsContact) return;
    setOptimisticallyAdded(true); // instant feedback
    try {
      const { error: rpcErr } = await supabase.rpc('add_contact', {
        p_contact_entity_id: peerEntityId,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      await refreshContacts(); // reconcile: isContact becomes DB-true
    } catch (err) {
      setOptimisticallyAdded(false); // revert; let the vendor retry
      console.warn('[PlexChat] add_contact failed', {
        peerEntityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [peerEntityId, savedAsContact, refreshContacts]);

  // Name the native Stack header after the other participant and mount the
  // "Add to contacts" action there. A list tap passes the name instantly via
  // route param; Accept resolves both name and id via useThreadPeer. Header-only
  // — does NOT touch the verified send path below.
  //
  // CRITICAL: savedAsContact + handleAddContact are in the dep array. The header
  // renders ONCE before get_my_contacts resolves; without these deps it would
  // never re-render when the async fetch lands, so an already-saved peer would
  // stick on "Add to contacts" — the exact persistence bug this build fixes.
  useEffect(() => {
    navigation.setOptions({
      title: peerName ?? route.params?.title ?? 'Conversation',
      headerRight: () => (
        <AddContactButton
          peerEntityId={peerEntityId}
          saved={savedAsContact}
          onAdd={handleAddContact}
        />
      ),
    });
  }, [navigation, peerName, peerEntityId, route.params?.title, savedAsContact, handleAddContact]);

  // Mark this thread read when it gains focus (16b item 2b). Clears its unread:
  // the read_at UPDATE decrements the PlexChat tab badge live (useUnreadCount's
  // realtime sub) and the per-row dot on the list's next focus refetch. Server-
  // side idempotent (a re-focus marks 0 rows) and received-only, so it can't
  // fight the INSERT-only message stream (useThreadMessages) or double-count.
  // Best-effort: a failure self-heals on the next focus, so log and move on.
  useFocusEffect(
    useCallback(() => {
      if (!threadId) return;
      void markThreadRead(threadId).catch((err) => {
        console.warn('[PlexChat] mark_thread_read on focus failed', {
          threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, [threadId, markThreadRead]),
  );

  const [pending, setPending] = useState<PendingMessage[]>([]);
  const nonce = useRef(0);

  // A pending send is "reconciled" once its canonical row appears in the stream:
  // id-match (primary, precise) OR body-match from me within the recent window
  // (fallback — clears a twin in EITHER 'sending' or 'failed' state).
  const findCanonicalTwin = useCallback(
    (p: PendingMessage): Message | undefined => {
      if (p.realId) {
        const byId = messages.find((m) => m.id === p.realId);
        if (byId) return byId;
      }
      return messages.find(
        (m) =>
          m.from_entity_id === myEntityId &&
          m.body === p.body &&
          Date.now() - new Date(m.created_at).getTime() < RECENT_TWIN_MS,
      );
    },
    [messages, myEntityId],
  );

  // Reconcile: when the stream changes, drop any pending whose canonical twin has
  // arrived (sending OR failed). Returns the same ref when nothing changed so this
  // never loops.
  useEffect(() => {
    setPending((prev) => {
      const next = prev.filter((p) => !findCanonicalTwin(p));
      return next.length === prev.length ? prev : next;
    });
  }, [findCanonicalTwin]);

  const doSend = useCallback(
    async (tempId: string, body: string) => {
      if (!threadId) return;
      try {
        const { messageId } = await postMessage(threadId, body);
        // Tag realId so the realtime arrival reconciles by id; keep the optimistic
        // bubble visible until the canonical row lands.
        setPending((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, realId: messageId } : p)),
        );
      } catch (err) {
        // post_message already logs the cause; record the UI transition too.
        console.warn('[PlexChat] send failed; marking optimistic bubble failed', {
          tempId,
          error: err instanceof Error ? err.message : String(err),
        });
        setPending((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, status: 'failed' } : p)),
        );
      }
    },
    [threadId, postMessage],
  );

  const handleSend = useCallback(
    (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || !threadId) return;
      const tempId = `temp-${nonce.current}`;
      nonce.current += 1;
      setPending((prev) => [
        ...prev,
        { tempId, body: trimmed, status: 'sending', realId: null },
      ]);
      void doSend(tempId, trimmed);
    },
    [threadId, doSend],
  );

  const handleRetry = useCallback(
    (tempId: string) => {
      const target = pending.find((p) => p.tempId === tempId);
      if (!target || target.status !== 'failed') return;
      // Retry guard: if the original send actually landed (canonical twin present),
      // reconcile instead of double-posting. Identical-text-twice-in-flight is an
      // accepted V1 limitation (body-match cannot tell two identical bodies apart).
      if (findCanonicalTwin(target)) {
        setPending((prev) => prev.filter((p) => p.tempId !== tempId));
        return;
      }
      setPending((prev) =>
        prev.map((p) => (p.tempId === tempId ? { ...p, status: 'sending' } : p)),
      );
      void doSend(tempId, target.body);
    },
    [pending, findCanonicalTwin, doSend],
  );

  // The list (no threadId) is a sibling Stack screen now; this screen is always
  // mounted with a threadId. Defensive guard only.
  if (!threadId) return null;

  // Filter at render too (not only in the effect): the instant a canonical twin
  // is in the stream, hide its optimistic bubble in the SAME render — no
  // double-bubble flash in the frame before the effect trims state.
  const visiblePending = pending.filter((p) => !findCanonicalTwin(p));

  const rows: Row[] = [
    ...messages.map((m) => ({
      kind: 'message' as const,
      key: m.id,
      body: m.body,
      mine: m.from_entity_id === myEntityId,
    })),
    ...visiblePending.map((p) => ({
      kind: 'pending' as const,
      key: p.tempId,
      tempId: p.tempId,
      body: p.body,
      status: p.status,
    })),
  ];

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'message') {
      return <ConversationBubble speaker={item.mine ? 'vendor' : 'hearth'} text={item.body} />;
    }
    if (item.status === 'failed') {
      return (
        <Pressable onPress={() => handleRetry(item.tempId)} accessibilityRole="button">
          <ConversationBubble speaker="vendor" text={item.body} />
          <Text style={styles.failedCaption}>Failed — tap to retry</Text>
        </Pressable>
      );
    }
    return (
      <View>
        <ConversationBubble speaker="vendor" text={item.body} />
        <Text style={styles.sendingCaption}>Sending…</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={styles.container}>
        {isLoading && rows.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : error && rows.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.title}>PlexChat</Text>
            <Text style={styles.subtitle}>Couldn’t load this conversation.</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.key}
            renderItem={renderRow}
            contentContainerStyle={[
              styles.listContent,
              rows.length === 0 && styles.listContentEmpty,
            ]}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.subtitle}>No messages yet.</Text>
              </View>
            }
          />
        )}
        <MessageComposer onSend={handleSend} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    padding: theme.spacing.lg,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  sendingCaption: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textAlign: 'right',
    marginTop: theme.spacing.xs,
  },
  failedCaption: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    textAlign: 'right',
    marginTop: theme.spacing.xs,
  },
  headerAction: {
    ...theme.typography.body,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  headerActionDone: {
    color: theme.colors.textMuted,
  },
});
