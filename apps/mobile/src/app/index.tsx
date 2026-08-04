import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getVolunteerSession, isAuthError } from '@/lib/api';
import { clearVolunteerToken, getVolunteerToken } from '@/lib/token';

type ResumeState = 'checking' | 'retry' | 'ready';

export default function JoinEntryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [resumeState, setResumeState] = useState<ResumeState>('checking');
  const [retryCount, setRetryCount] = useState(0);

  // A returning volunteer already has a stored token — skip straight back
  // to wherever their session currently stands instead of re-joining. Only
  // a definitive "token is invalid" response clears it; a network error
  // must not silently sign out a volunteer who is still legitimately
  // pending/approved just because they have poor signal. `retryCount` lets
  // the "Retry" button below re-run this without duplicating the logic.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setResumeState('checking');
      const token = await getVolunteerToken();
      if (!token) {
        if (!cancelled) setResumeState('ready');
        return;
      }

      try {
        const session = await getVolunteerSession(token);
        if (cancelled) return;

        if (session.status === 'approved') {
          router.replace('/map');
        } else if (session.status === 'pending') {
          router.replace('/pending');
        } else {
          await clearVolunteerToken();
          setResumeState('ready');
        }
      } catch (error) {
        if (cancelled) return;
        if (isAuthError(error)) {
          await clearVolunteerToken();
          setResumeState('ready');
        } else {
          setResumeState('retry');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, retryCount]);

  if (resumeState === 'checking') {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (resumeState === 'retry') {
    return (
      <ThemedView style={styles.centered}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="subtitle" style={styles.title}>
            Couldn&apos;t check your session
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Check your connection and try again.
          </ThemedText>
          <PrimaryButton label="Retry" onPress={() => setRetryCount((c) => c + 1)} />
          <PrimaryButton
            label="Enter a code instead"
            variant="secondary"
            onPress={() => setResumeState('ready')}
          />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const handleSubmit = () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    router.push({ pathname: '/join/[code]', params: { code: trimmed } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          FindThem
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
          Enter the code a coordinator shared with you to join a search.
        </ThemedText>

        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Join code"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[styles.input, { color: theme.text, borderColor: theme.textSecondary }]}
          onSubmitEditing={handleSubmit}
          returnKeyType="go"
        />

        <PrimaryButton label="Continue" onPress={handleSubmit} disabled={!code.trim()} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 18,
    letterSpacing: 2,
    textAlign: 'center',
  },
});
