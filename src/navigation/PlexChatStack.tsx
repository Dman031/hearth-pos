import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConversationListScreen from '../screens/ConversationListScreen';
import PlexChatScreen from '../screens/PlexChatScreen';
import { theme } from '../styles/theme';

// PlexChatStack — the PlexChat tab's nested Stack (16b item 4). iMessage pattern:
//   - ConversationList: the list of conversations (header "Messages").
//   - Conversation: the single thread + composer (PlexChatScreen). Its native
//     header title is the contact's name (set by the screen via setOptions), with
//     native back / swipe-to-go-back to the list.
// The PlexChat tab disables its tab-level ShellHeader (TabNavigator) so this Stack
// owns the header — no double header.

export type PlexChatStackParamList = {
  ConversationList: undefined;
  Conversation: { threadId: string; title?: string };
};

const Stack = createNativeStackNavigator<PlexChatStackParamList>();

export default function PlexChatStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.accent,
        headerTitleStyle: { color: theme.colors.textPrimary },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen
        name="ConversationList"
        component={ConversationListScreen}
        options={{ title: 'Messages' }}
      />
      <Stack.Screen
        name="Conversation"
        component={PlexChatScreen}
        options={{ title: 'Conversation' }}
      />
    </Stack.Navigator>
  );
}
