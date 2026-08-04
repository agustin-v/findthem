import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

interface LocationConsentNoticeProps {
  status: 'undetermined' | 'denied';
  onRequest: () => void;
}

// Ties back to the consent_location checkbox captured at join time (Story
// 17/18) — this is where that consent actually gets exercised.
export function LocationConsentNotice({ status, onRequest }: LocationConsentNoticeProps) {
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        {status === 'denied'
          ? "Location is off, so this report won't include a map position. You agreed to share your location while helping — you can turn it back on in your device settings."
          : 'You agreed to share your location while helping with this search. FindThem uses it to log where this report was made from.'}
      </ThemedText>
      {status === 'undetermined' && (
        <PrimaryButton label="Allow location" onPress={onRequest} variant="secondary" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
});
