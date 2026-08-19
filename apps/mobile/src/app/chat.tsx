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
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
// contactPhone arrives as a router param, not straight from a trusted
// server response in this screen's own fetch — a crafted deep link
// (findthem://chat?contactPhone=...) could otherwise put an arbitrary
// string behind a "Call coordinator" affordance. tel: scheme injection
// itself isn't possible (RN parses everything before the first ':' as the
// scheme, and Linking.openURL uses ACTION_VIEW, not auto-dialing), but an
// unvalidated value could still read as a plausible-looking wrong number.
const PHONE_PATTERN = /^\+?[0-9\s\-()]{3,20}$/;

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
  const [headerHeight, setHeaderHeight] = useState(0);
  const insets = useSafeAreaInsets();
  // Set on the explicit back button AND on unmount (see the cleanup effect
  // below) — a real routed screen unmounts on a swipe-back/hardware-back
  // gesture too, not just the header button, and an in-flight send's
  // success/catch/finally must not write state after that.
  const cancelledRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  // A client-generated id is only replay-safe (Messages.create_message's
  // on_conflict: :nothing dedupes on it) if the SAME id is reused across
  // retries of the *same* draft — tracks both so a retry of unchanged text
  // reuses the id, but abandoning a failed send and typing something new
  // mints a fresh one instead of misattaching it to different text.
  const pendingSendRef = useRef<{ id: string; text: string } | null>(null);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const handleAuthExpired = useCallback(async () => {
    await clearVolunteerToken();
    resetSocket();
    resetChatReadState();
    // dismissAll() first so a dead-token map.tsx isn't left one back-swipe
    // away — replace() alone only swaps the top of the stack.
    router.dismissAll();
    router.replace('/');
  }, [router]);

  // seqRef, not just an in-flight flag — this fires from four independent
  // triggers (mount, 15s poll, socket debounce, and a retry button), and
  // an older response resolving after a newer one must not win and revert
  // the thread to stale data.
  const loadMessagesSeqRef = useRef(0);
  const loadMessages = useCallback(
    async (authToken: string) => {
      const seq = ++loadMessagesSeqRef.current;
      try {
        const data = await getVolunteerMessages(authToken);
        if (seq !== loadMessagesSeqRef.current) return;
        setMessages(data);
        setScreenState('ready');
        const lastCoordinatorMessage = [...data].reverse().find((m) => m.sender === 'coordinator');
        if (lastCoordinatorMessage) markReadUpTo(lastCoordinatorMessage.insertedAt);
      } catch (error) {
        if (seq !== loadMessagesSeqRef.current) return;
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
    // Reused only if this is a retry of the exact same text that just
    // failed — a timed-out-but-actually-succeeded send followed by a
    // manual retry of the same draft must replay the same id (server-side
    // on_conflict: :nothing makes that a safe no-op) rather than mint a
    // fresh one and double-post. Abandoning a failed send and typing
    // something new correctly gets its own fresh id instead.
    const id = pendingSendRef.current?.text === text ? pendingSendRef.current.id : Crypto.randomUUID();
    pendingSendRef.current = { id, text };

    try {
      const sent = await sendVolunteerMessage(token, { id, text });
      pendingSendRef.current = null;
      if (cancelledRef.current) return;
      // The message_created socket push can independently trigger a
      // loadMessages() that already includes this message before this
      // POST's own response comes back — append only if it isn't there yet.
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (error) {
      if (isAuthError(error)) {
        // Checked before the cancelled guard below — a removed volunteer
        // must still be signed out even if they tapped back while the
        // send was in flight.
        pendingSendRef.current = null;
        await handleAuthExpired();
        return;
      }
      if (cancelledRef.current) return;
      // Restored only if nothing newer was typed in the meantime — don't
      // clobber text the volunteer already moved on to composing.
      setDraft((current) => (current ? current : text));
      setSendError(
        error instanceof ApiError
          ? 'Could not send. Please try again.'
          : 'Something went wrong. Please check your connection and try again.',
      );
    } finally {
      if (!cancelledRef.current) setSending(false);
    }
  };

  const validContactPhone = contactPhone && PHONE_PATTERN.test(contactPhone) ? contactPhone : null;

  const handleHeaderLayout = (e: LayoutChangeEvent) => {
    setHeaderHeight(e.nativeEvent.layout.height);
  };

  return (
    <ThemedView style={styles.container}>
      {/* Only the top edge — a bottom edge here would double-count the
          home-indicator inset against KeyboardAvoidingView's own padding
          behavior below, leaving a gap between the composer and the
          keyboard. The composer applies insets.bottom itself instead, so
          spacing is still correct with the keyboard dismissed. */}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View
          style={[styles.header, { borderBottomColor: theme.border }]}
          onLayout={handleHeaderLayout}>
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
          {validContactPhone && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Call coordinator"
              style={[styles.callButton, { backgroundColor: theme.primarySoft }]}
              onPress={() => Linking.openURL(`tel:${validContactPhone}`)}>
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
            keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
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

            {sendError && (
              <ThemedText type="small" style={styles.error}>
                {sendError}
              </ThemedText>
            )}
            <View
              style={[
                styles.composer,
                { borderTopColor: theme.border, paddingBottom: Spacing.three + insets.bottom },
              ]}>
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
