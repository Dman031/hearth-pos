import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme, tileSurface } from '../styles/theme';
import useThreads, { type Conversation } from '../hooks/useThreads';

// ConversationListScreen — the PlexChat list (16b item 4): every established
// conversation I'm in, newest-active first, labelled by the other participant's
// public name. Tapping a row opens that thread in the SAME conversation screen
// the Accept flow lands on (the nested Stack's "Conversation" route). List-only:
// each row shows an unread DOT (16b item 2b) when it has messages I haven't read;
// the dot clears on the next focus refetch after I open the thread (mark_thread_read
// stamps read_at). No compose here (that lives in the thread). Rows carry no timestamp — see useThreads (datetime.ts not built yet).

export default function ConversationListScreen() {
  const navigation = useNavigation<{
    navigate: (screen: string, params?: object) => void;
  }>();
  const { conversations, isLoading, error } = useThreads();

  const openThread = (item: Conversation) => {
    navigation.navigate('Conversation', { threadId: item.threadId, title: item.peerName });
  };

  if (isLoading && conversations.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (error && conversations.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>Couldn’t load conversations.</Text>
      </View>
    );
  }

  if (conversations.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>No conversations yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.threadId}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => openThread(item)}
            accessibilityRole="button"
          >
            <Text style={styles.rowName} numberOfLines={1}>
              {item.peerName}
            </Text>
            {item.unreadCount > 0 && (
              <View
                style={styles.unreadDot}
                accessibilityLabel="Unread messages"
              />
            )}
          </Pressable>
        )}
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
  row: {
    ...tileSurface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  rowName: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.semiBold,
    flex: 1,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.accent,
    marginLeft: theme.spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
});
