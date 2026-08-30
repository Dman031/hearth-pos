import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
import ThreadDecisionBanner from '../components/ThreadDecisionBanner';
import { signedSuperbillUrl } from '../services/superbill';
import { SUPERBILL_LINK_FAILED, SUPERBILL_OPEN, SUPERBILL_OPEN_FAILED } from '../services/visit-copy';
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
  // `path` is the SUPERBILL row's storage path, from the message payload
  // (0042:139-146). It is mutually exclusive with `url` in practice: the room
  // link's URL is in the BODY, the superbill's pointer is in the PAYLOAD, and
  // neither message carries the other's shape.
  | { kind: 'system'; key: string; body: string; url: string | null; path: string | null }
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

  /**
   * Opens an issued superbill from the path in its message payload.
   *
   * A FRESH LINK EVERY TAP. Nothing is cached and no countdown is shown: the
   * 600-second expiry is the link's, not the document's, and minting per tap is
   * what makes it a detail nobody meets (0042:134-138).
   *
   * TAP-OUT — the OS renders the PDF and its own share sheet and "Save to
   * Files" are the platform's. This app ships no viewer and no download.
   */
  const openSuperbill = useCallback(async (storagePath: string) => {
    const url = await signedSuperbillUrl(storagePath);
    if (!url) {
      Alert.alert('Couldn’t open that', SUPERBILL_LINK_FAILED);
      return;
    }
    if (!(await Linking.canOpenURL(url))) {
      Alert.alert('Couldn’t open that', SUPERBILL_OPEN_FAILED);
      return;
    }
    await Linking.openURL(url);
  }, []);

  // The list (no threadId) is a sibling Stack screen now; this screen is always
  // mounted with a threadId. Defensive guard only.
  if (!threadId) return null;

  // Filter at render too (not only in the effect): the instant a canonical twin
  // is in the stream, hide its optimistic bubble in the SAME render — no
  // double-bubble flash in the frame before the effect trims state.
  const visiblePending = pending.filter((p) => !findCanonicalTwin(p));

  const rows: Row[] = [
    // ORIGIN CARRIES AUTHORSHIP; from_entity_id DOES NOT.
    //
    // This mapping used to derive the speaker from from_entity_id alone, which
    // made EVERY origin='system' row render as a person — as the vendor's own
    // bubble when the row carried their id, and as the peer's otherwise. That
    // was a general rendering defect, not a visit-link one; the room link is
    // simply the first system message this app will ever show.
    //
    // It matters most exactly there: post_visit_link writes the row with the
    // SELLER's from_entity_id because the column is NOT NULL (0041), so a
    // clinician would have appeared to type a link at their own patient an hour
    // before the visit. That is the same authorship lie E-3a ruled against in
    // the From line — she tapped Accept, she did not write it.
    ...messages.map((m) =>
      m.origin === 'system'
        ? {
            kind: 'system' as const,
            key: m.id,
            body: m.body,
            url: extractUrl(m.body),
            path: superbillPath(m),
          }
        : {
            kind: 'message' as const,
            key: m.id,
            body: m.body,
            mine: m.from_entity_id === myEntityId,
          },
    ),
    ...visiblePending.map((p) => ({
      kind: 'pending' as const,
      key: p.tempId,
      tempId: p.tempId,
      body: p.body,
      status: p.status,
    })),
  ];

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'system') {
      // THE SUPERBILL ROW. Until this branch existed the announcement rendered
      // as inert grey text: `payload` was never read and extractUrl found
      // nothing, because the body deliberately carries no URL. A message saying
      // a document is ready, with no way to open it, is worse than no message.
      //
      // THE LINK IS MINTED PER TAP AND NEVER STORED. A signed URL lives 600
      // seconds and a message lives forever, which is exactly why the payload
      // carries the PATH (0042:134-138). Both participants may open it —
      // pos-0005 scopes the read to either side of the engagement.
      if (item.path) {
        const path = item.path;
        return (
          <Pressable
            style={styles.systemRow}
            onPress={() => void openSuperbill(path)}
            accessibilityRole="link"
          >
            <Text style={styles.systemText}>{item.body}</Text>
            <Text style={styles.systemAction}>{SUPERBILL_OPEN}</Text>
          </Pressable>
        );
      }
      // Not a bubble, and attributed to nobody. A link row when it carries one
      // — the room link's URL lives in the BODY, not the payload (0041).
      if (item.url) {
        return (
          <Pressable
            style={styles.systemRow}
            onPress={() => void Linking.openURL(item.url as string)}
            accessibilityRole="link"
          >
            <Text style={styles.systemText}>{item.body}</Text>
          </Pressable>
        );
      }
      return (
        <View style={styles.systemRow}>
          <Text style={styles.systemText}>{item.body}</Text>
        </View>
      );
    }
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
        {/* The decision slot (Day 21 STOP 4, the Josh fix): pending decisions
            and commitment status for THIS thread, pinned where the vendor is
            actually looking — see ThreadDecisionBanner for the slot contract
            and the visual-differentiation rationale. It renders null when the
            thread has nothing to decide and no commitments. */}
        <ThreadDecisionBanner threadId={threadId} />
        <MessageComposer onSend={handleSend} />
      </View>
    </KeyboardAvoidingView>
  );
}

/** The first URL in a body, or null. The room link's URL is in the BODY rather
 *  than the payload (0041's post_visit_link writes
 *  'Your visit room is ready: ' || url), so a system row finds its link here. */
function extractUrl(body: string): string | null {
  return /https?:\/\/[^\s]+/.exec(body)?.[0] ?? null;
}

/**
 * The storage path on a `superbill` message, or null.
 *
 * GATED ON kind, NOT ON THE PRESENCE OF A PATH. Any future payload that happens
 * to carry a `storage_path` would otherwise render as a superbill link, which is
 * the kind of accident a closed check prevents and an open one invites.
 */
function superbillPath(m: Message): string | null {
  if (m.kind !== 'superbill') return null;
  const path = (m.payload ?? {}).storage_path;
  if (typeof path !== 'string' || path.length === 0) {
    // The row exists and its pointer does not — say nothing rather than render
    // a tap that cannot work. Logged, never silent.
    console.warn('[PlexChat] superbill message with no storage_path', { messageId: m.id });
    return null;
  }
  return path;
}

const styles = StyleSheet.create({
  // System rows are NOT bubbles. A bubble on either side is an authorship
  // claim, and origin='system' means nobody wrote it.
  systemRow: {
    alignSelf: 'center',
    maxWidth: '90%',
    marginVertical: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    backgroundColor: theme.colors.surfaceInset,
  },
  systemText: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  // The affordance on a document row. Said out loud rather than implied by a
  // tint: a system row is not a bubble and carries no other tap cue.
  systemAction: {
    ...theme.typography.caption,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
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
    fontFamily: theme.fonts.semiBold,
  },
  headerActionDone: {
    color: theme.colors.textMuted,
  },
});
