import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Phone, Send } from 'lucide-react-native';
import type { Channel } from 'phoenix';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiError,
  getVolunteerMessages,
  isAuthError,
  sendVolunteerMessage,
  type Message,
} from '@/lib/api';
import { markReadUpTo, resetChatReadState } from '@/lib/chat-read-state';
import { getSocket, resetSocket } from '@/lib/socket';
import { clearVolunteerToken, getVolunteerToken } from '@/lib/token';

const POLL_INTERVAL_MS = 15000;
const REFRESH_DEBOUNCE_MS = 400;

type ScreenState = 'loading' | 'ready' | 'error';

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  if (isSameDay(date, new Date())) return 'Today';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ChatScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { searchId, contactPhone } = useLocalSearchParams<{ searchId: string; contactPhone?: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleAuthExpired = useCallback(async () => {
    await clearVolunteerToken();
    resetSocket();
    resetChatReadState();
    router.replace('/');
  }, [router]);

  const loadMessages = useCallback(
    async (authToken: string) => {
      try {
        const data = await getVolunteerMessages(authToken);
        setMessages(data);
        setScreenState('ready');
        const lastCoordinatorMessage = [...data].reverse().find((m) => m.sender === 'coordinator');
        if (lastCoordinatorMessage) markReadUpTo(lastCoordinatorMessage.insertedAt);
      } catch (error) {
        if (isAuthError(error)) {
          await handleAuthExpired();
        } else {
          setScreenState((prev) => (prev === 'ready' ? prev : 'error'));
        }
      }
    },
    [handleAuthExpired],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedToken = await getVolunteerToken();
      if (!storedToken) {
        router.replace('/');
        return;
      }
      if (cancelled) return;
      setToken(storedToken);
      await loadMessages(storedToken);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same 15s poll fallback as map.tsx, so the thread stays live even if the
  // socket below never connects — every message-arrival path here is a
  // "wake up sooner" layer on top of this poll, not a replacement for it.
  useEffect(() => {
    if (!token) return undefined;
    let inFlight = false;
    const interval = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      await loadMessages(token);
      inFlight = false;
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token, loadMessages]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!token || !searchId) return undefined;
    let channel: Channel | null = null;
    let cancelled = false;

    const debouncedRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => loadMessages(token), REFRESH_DEBOUNCE_MS);
    };

    getSocket()
      .then((socket) => {
        if (cancelled) return;
        channel = socket.channel(`search:${searchId}`, {});
        channel.on('message_created', debouncedRefresh);
        channel.join().receive('error', (reason) => {
          console.warn(`search:${searchId} channel join failed`, reason);
        });
      })
      .catch((error) => {
        console.warn('Realtime socket unavailable, continuing on REST polling', error);
      });

    return () => {
      cancelled = true;
      channel?.leave();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [token, searchId, loadMessages]);

  useEffect(() => {
    // Fires after the message list actually re-renders with new content.
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [messages.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !token || sending) return;
    cancelledRef.current = false;
    setSending(true);
    setSendError(null);
    setDraft('');

    try {
      const sent = await sendVolunteerMessage(token, { id: Crypto.randomUUID(), text });
      if (cancelledRef.current) return;
      setMessages((prev) => [...prev, sent]);
    } catch (error) {
      if (cancelledRef.current) return;
      // Restored (not lost) so a failed send doesn't destroy text the
      // volunteer can't easily retype from memory in the field.
      setDraft(text);
      if (isAuthError(error)) {
        await handleAuthExpired();
      } else {
        setSendError(
          error instanceof ApiError
            ? 'Could not send. Please try again.'
            : 'Something went wrong. Please check your connection and try again.',
        );
      }
    } finally {
      if (!cancelledRef.current) setSending(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => {
              cancelledRef.current = true;
              router.back();
            }}
            hitSlop={8}>
            <ArrowLeft color={theme.text} size={22} />
          </Pressable>
          <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              C
            </ThemedText>
          </View>
          <View style={styles.headerInfo}>
            <ThemedText type="smallBold">Coordinator</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              This search
            </ThemedText>
          </View>
          {contactPhone && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Call coordinator"
              style={[styles.callButton, { backgroundColor: theme.primarySoft }]}
              onPress={() => Linking.openURL(`tel:${contactPhone}`)}>
              <Phone color={theme.primary} size={18} />
            </Pressable>
          )}
        </View>

        {screenState === 'loading' ? (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        ) : screenState === 'error' ? (
          <View style={[styles.centered, styles.errorContent]}>
            <ThemedText themeColor="textSecondary" style={styles.centerText}>
              Couldn&apos;t load this conversation. Check your connection and try again.
            </ThemedText>
            <PrimaryButton label="Retry" onPress={() => token && loadMessages(token)} />
          </View>
        ) : (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
            <ScrollView ref={scrollRef} contentContainerStyle={styles.messageList}>
              {messages.length === 0 ? (
                <ThemedText themeColor="textSecondary" style={styles.centerText}>
                  No messages yet. Say hello to your coordinator.
                </ThemedText>
              ) : (
                messages.map((message, i) => {
                  const prev = messages[i - 1];
                  const showDivider = !prev || !isSameDay(new Date(prev.insertedAt), new Date(message.insertedAt));
                  const fromCoordinator = message.sender === 'coordinator';
                  return (
                    <View key={message.id}>
                      {showDivider && (
                        <ThemedText
                          type="code"
                          themeColor="textSecondary"
                          style={styles.dayDivider}>
                          {formatDayLabel(message.insertedAt)}
                        </ThemedText>
                      )}
                      <View style={[styles.bubbleRow, fromCoordinator ? styles.rowStart : styles.rowEnd]}>
                        <View
                          style={[
                            styles.bubble,
                            fromCoordinator
                              ? { backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1 }
                              : { backgroundColor: theme.primary },
                          ]}>
                          <ThemedText
                            style={fromCoordinator ? undefined : { color: theme.primaryText }}>
                            {message.text}
                          </ThemedText>
                        </View>
                      </View>
                      <ThemedText
                        type="small"
                        themeColor="textSecondary"
                        style={[styles.timestamp, fromCoordinator ? styles.rowStart : styles.rowEnd]}>
                        {formatTime(message.insertedAt)}
                      </ThemedText>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={[styles.composer, { borderTopColor: theme.border }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Message Coordinator..."
                placeholderTextColor={theme.textSecondary}
                maxLength={2000}
                multiline
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                disabled={!draft.trim() || sending}
                onPress={handleSend}
                style={[
                  styles.sendButton,
                  { backgroundColor: theme.primary },
                  (!draft.trim() || sending) && styles.sendButtonDisabled,
                ]}>
                {sending ? (
                  <ActivityIndicator color={theme.primaryText} size="small" />
                ) : (
                  <Send color={theme.primaryText} size={18} />
                )}
              </Pressable>
            </View>
            {sendError && (
              <ThemedText type="small" style={styles.error}>
                {sendError}
              </ThemedText>
            )}
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  errorContent: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  callButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: {
    padding: Spacing.three,
    gap: Spacing.one,
    flexGrow: 1,
  },
  dayDivider: {
    alignSelf: 'center',
    marginVertical: Spacing.two,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  rowStart: {
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
  },
  rowEnd: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  timestamp: {
    marginTop: 2,
    marginBottom: Spacing.two,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  error: {
    color: '#B3432B',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
});
