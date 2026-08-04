import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { clearVolunteerToken } from '@/lib/token';

// Placeholder landing spot for an approved volunteer — the real map view
// (zones, mark-searched, remarks) ships in Story 21.
export default function MapPlaceholderScreen() {
  const router = useRouter();

  const handleForgetDevice = async () => {
    await clearVolunteerToken();
    router.replace('/');
  };

  return (
    <ThemedView style={styles.centered}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.centerText}>
          You&apos;re in!
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          You&apos;ve been approved to help with this search. The map view is coming soon.
        </ThemedText>
        <PrimaryButton
          label="Use a different code on this device"
          variant="secondary"
          onPress={handleForgetDevice}
        />
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
});
