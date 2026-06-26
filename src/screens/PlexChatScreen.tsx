import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { theme } from '../styles/theme';
import useEntity from '../hooks/useEntity';
import useThreadMessages from '../hooks/useThreadMessages';
import ConversationBubble from '../components/ConversationBubble';

// PlexChatScreen — the conversation that follows an accepted knock. 16a is a
// READ view only: realtime messages, opened from Incoming on Accept (the tab is
// navigated with a threadId param). Compose/send is 16b. Reuses the carved
// ConversationBubble — my messages render as the amber 'vendor' bubble (right),
// the other party as the 'hearth' surface bubble (left).
export default function PlexChatScreen() {
  const route = useRoute<{ key: string; name: string; params?: { threadId?: string } }>();
  const threadId = route.params?.threadId ?? null;
  const { entity } = useEntity();
  const myEntityId = entity?.id ?? null;
  const { messages, isLoading, error } = useThreadMessages(threadId);

  if (!threadId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>PlexChat</Text>
        <Text style={styles.subtitle}>Open a conversation from Incoming.</Text>
      </View>
    );
  }

  if (isLoading && messages.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (error && messages.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>PlexChat</Text>
        <Text style={styles.subtitle}>Couldn’t load this conversation.</Text>
      </View>
    );
  }

  if (messages.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>PlexChat</Text>
        <Text style={styles.subtitle}>No messages yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationBubble
            speaker={item.from_entity_id === myEntityId ? 'vendor' : 'hearth'}
            text={item.body}
          />
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    padding: theme.spacing.lg,
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
});
