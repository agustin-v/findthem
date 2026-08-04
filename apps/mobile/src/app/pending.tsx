import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getVolunteerSession, isAuthError } from '@/lib/api';
import { clearVolunteerToken, getVolunteerToken } from '@/lib/token';

const POLL_INTERVAL_MS = 4000;

export default function PendingScreen() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
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
            router.replace('/map');
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
  error: {
    color: '#e5484d',
  },
});
