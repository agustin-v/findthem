import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getVolunteerSearch, getVolunteerSession, isAuthError } from '@/lib/api';
import { resetChatReadState } from '@/lib/chat-read-state';
import { resetSocket } from '@/lib/socket';
import { clearVolunteerToken, getVolunteerToken } from '@/lib/token';

const POLL_INTERVAL_MS = 4000;

interface Handoff {
  subjectName: string;
  area: string | null;
}

export default function PendingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [name, setName] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [removed, setRemoved] = useState(false);
  const [expired, setExpired] = useState(false);
  const [connectionTrouble, setConnectionTrouble] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      // A slow request must not overlap with the next interval tick — the
      // last response to land would otherwise win regardless of which was
      // actually more recent.
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const token = await getVolunteerToken();
        if (cancelled) return;

        if (!token) {
          if (pollRef.current) clearInterval(pollRef.current);
          router.replace('/');
          return;
        }

        try {
          const session = await getVolunteerSession(token);
          if (cancelled) return;

          setConnectionTrouble(false);
          setName(session.name);

          if (session.status === 'approved') {
            if (pollRef.current) clearInterval(pollRef.current);
            // A tap-through handoff screen ("You're approved") rather than
            // silently dropping the volunteer straight onto the map — the
            // subject/area details it shows come from a one-time fetch;
            // if that fails, just proceed straight to /map instead of
            // blocking the volunteer on a screen that failed to load.
            try {
              const { search } = await getVolunteerSearch(token);
              if (cancelled) return;
              setHandoff({ subjectName: search.subjectName, area: search.lkpAddress });
            } catch {
              if (cancelled) return;
              router.replace('/map');
            }
          } else if (session.status === 'removed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setRemoved(true);
          }
        } catch (error) {
          if (cancelled) return;

          if (isAuthError(error)) {
            // Only a definitive "token is invalid" response ends the wait —
            // a network blip or timeout just retries on the next tick.
            if (pollRef.current) clearInterval(pollRef.current);
            await clearVolunteerToken();
            resetSocket();
            resetChatReadState();
            setExpired(true);
          } else {
            setConnectionTrouble(true);
          }
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [router]);

  const handleStartOver = async () => {
    await clearVolunteerToken();
    resetSocket();
    resetChatReadState();
    router.replace('/');
  };

  if (removed || expired) {
    return (
      <ThemedView style={styles.centered}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="subtitle" style={styles.centerText}>
            {removed ? 'Request declined' : 'Your session expired'}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            {removed
              ? "The coordinator didn't approve your request to join this search."
              : 'Please join again with your code.'}
          </ThemedText>
          <PrimaryButton label="Try a different code" onPress={handleStartOver} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (handoff) {
    return (
      <ThemedView style={styles.centered}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedView type="successSoft" style={styles.checkBadge}>
            <Check color={theme.success} size={32} />
          </ThemedView>
          <ThemedText type="subtitle" style={styles.centerText}>
            You&apos;re approved
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            You&apos;re now part of the search for {handoff.subjectName}.
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{handoff.subjectName}</ThemedText>
            {handoff.area && (
              <ThemedText type="small" themeColor="textSecondary">
                {handoff.area}
              </ThemedText>
            )}
          </ThemedView>

          <PrimaryButton label="View my area →" onPress={() => router.replace('/map')} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.centered}>
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator size="large" />
        <ThemedText type="subtitle" style={styles.centerText}>
          Waiting for approval
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          {name ? `Hang tight, ${name} — ` : ''}a coordinator needs to approve your request
          before you can start helping.
        </ThemedText>
        {connectionTrouble && (
          <ThemedText type="small" style={styles.error}>
            Having trouble connecting — still trying...
          </ThemedText>
        )}
        <PrimaryButton label="Use a different code" variant="secondary" onPress={handleStartOver} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  checkBadge: {
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.half,
  },
  error: {
    color: '#B3432B',
  },
});
