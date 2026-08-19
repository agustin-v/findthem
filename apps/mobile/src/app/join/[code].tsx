import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConsentRow } from '@/components/consent-row';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiError,
  getJoinPreview,
  isNotFoundError,
  joinSearch,
  type JoinPreview,
  type ResourceType,
} from '@/lib/api';
import { saveVolunteerToken } from '@/lib/token';

const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: 'people', label: 'On foot' },
  { value: 'motorbikes', label: 'Motorbike' },
  { value: 'cars', label: 'Car' },
  { value: 'drones', label: 'Drone' },
];

type PreviewState = 'loading' | 'loaded' | 'invalid' | 'retry';

export default function JoinConsentScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const theme = useTheme();

  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>('loading');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType | undefined>(undefined);
  const [consentName, setConsentName] = useState(false);
  const [consentLocation, setConsentLocation] = useState(false);
  const [consentPhone, setConsentPhone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setPreviewState('loading');
      try {
        const result = await getJoinPreview(code);
        if (cancelled) return;
        setPreview(result);
        setPreviewState('loaded');
      } catch (error) {
        if (cancelled) return;
        // A 404 means the code itself is genuinely invalid/expired —
        // anything else (network error, timeout, 5xx) is transient and
        // worth retrying rather than telling the volunteer their code is
        // bad when it's fine.
        setPreviewState(isNotFoundError(error) ? 'invalid' : 'retry');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, retryCount]);

  const canSubmit =
    name.trim().length > 0 &&
    phone.trim().length > 0 &&
    consentName &&
    consentLocation &&
    consentPhone &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await joinSearch(code, {
        name: name.trim(),
        phone: phone.trim(),
        resourceType,
        consentName,
        consentLocation,
        consentPhone,
      });
      await saveVolunteerToken(result.token);
      router.replace('/pending');
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? 'Could not submit your request. Please check your details and try again.'
          : 'Something went wrong. Please try again.',
      );
      setSubmitting(false);
    }
  };

  if (previewState === 'loading') {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (previewState === 'invalid') {
    return (
      <ThemedView style={styles.centered}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="subtitle" style={styles.centerText}>
            Invalid code
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            This code isn&apos;t valid or the search is no longer active.
          </ThemedText>
          <PrimaryButton label="Try a different code" onPress={() => router.replace('/')} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (previewState === 'retry' || !preview) {
    return (
      <ThemedView style={styles.centered}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="subtitle" style={styles.centerText}>
            Couldn&apos;t load this search
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            Check your connection and try again.
          </ThemedText>
          <PrimaryButton label="Retry" onPress={() => setRetryCount((c) => c + 1)} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedView type="backgroundElement" style={[styles.card, styles.subjectRow]}>
            <ThemedView type="backgroundSelected" style={styles.subjectThumb} />
            <ThemedView style={styles.subjectInfo}>
              <ThemedText type="smallBold">{preview.subjectName}</ThemedText>
              {preview.area && (
                <ThemedText type="small" themeColor="textSecondary">
                  Last seen near {preview.area}
                </ThemedText>
              )}
            </ThemedView>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="code" themeColor="textSecondary">
              Your details
            </ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            />
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="code" themeColor="textSecondary">
              How are you helping? · optional
            </ThemedText>
            <ThemedView style={styles.chipRow}>
              {RESOURCE_TYPES.map((option) => {
                const selected = resourceType === option.value;
                return (
                  <ThemedText
                    key={option.value}
                    type="smallBold"
                    onPress={() => setResourceType(selected ? undefined : option.value)}
                    style={[
                      styles.chip,
                      { backgroundColor: theme.backgroundSelected, color: theme.text },
                      selected && { backgroundColor: theme.primary, color: theme.primaryText },
                    ]}>
                    {option.label}
                  </ThemedText>
                );
              })}
            </ThemedView>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ConsentRow
              label="Share my name"
              checked={consentName}
              onToggle={() => setConsentName((v) => !v)}
            />
            <ThemedView type="border" style={styles.divider} />
            <ConsentRow
              label="Share my location while helping"
              checked={consentLocation}
              onToggle={() => setConsentLocation((v) => !v)}
            />
            <ThemedView type="border" style={styles.divider} />
            <ConsentRow
              label="Share my phone number"
              checked={consentPhone}
              onToggle={() => setConsentPhone((v) => !v)}
            />
          </ThemedView>

          {submitError && (
            <ThemedText type="small" style={styles.error}>
              {submitError}
            </ThemedText>
          )}

          <PrimaryButton
            label="Request to join"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
          />
        </SafeAreaView>
      </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
  },
  safeArea: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.three,
  },
  centerText: {
    textAlign: 'center',
  },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subjectThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.chip,
  },
  subjectInfo: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: 1,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    overflow: 'hidden',
  },
  error: {
    color: '#B3432B',
  },
});
