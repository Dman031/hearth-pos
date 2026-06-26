import React, { useCallback } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../styles/theme';
import { supabase } from '../services/supabase';
import useInbound from '../hooks/useInbound';
import InboundTile from '../components/InboundTile';
import type { Inbound } from '../types/inbound';

// IncomingScreen — the "Incoming" tab: the first-contact consent gate. Realtime
// pending knocks render as tiles; Accept opens a PlexChat thread (writing the
// optional opening line as message #1) and navigates to the conversation;
// Decline passes the knock. All writes go through the respond_to_inbound RPC —
// the single canonical write path — never a direct table write.
export default function IncomingScreen() {
  const navigation = useNavigation<{ navigate: (screen: string, params?: object) => void }>();
  const { inbound, isLoading, error } = useInbound();

  const handleAccept = useCallback(
    async (item: Inbound, body: string) => {
      const { data, error: rpcErr } = await supabase.rpc('respond_to_inbound', {
        p_inbound_id: item.id,
        p_decision: 'accepted',
        p_body: body.length > 0 ? body : null,
      });
      // RPC failure is a hard failure — surface it to the tile, never swallow.
      if (rpcErr) throw new Error(rpcErr.message);
      const threadId =
        (data && typeof data === 'object' ? (data as { thread_id?: string }).thread_id : null) ??
        item.thread_id;
      if (threadId) navigation.navigate('PlexChat', { threadId });
    },
    [navigation],
  );

  const handleDecline = useCallback(async (item: Inbound) => {
    const { error: rpcErr } = await supabase.rpc('respond_to_inbound', {
      p_inbound_id: item.id,
      p_decision: 'passed',
    });
    if (rpcErr) throw new Error(rpcErr.message);
  }, []);

  if (isLoading && inbound.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (error && inbound.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Incoming</Text>
        <Text style={styles.subtitle}>Couldn’t load right now.</Text>
      </View>
    );
  }

  if (inbound.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Incoming</Text>
        <Text style={styles.subtitle}>Nothing waiting yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={inbound}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <InboundTile inbound={item} onAccept={handleAccept} onDecline={handleDecline} />
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
