import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

interface SubjectPhotoModalProps {
  visible: boolean;
  subjectName: string;
  photoUrls: string[];
  onClose: () => void;
}

// Presigned URLs (1hr expiry, see apps/api's Photos.presigned_urls/1) —
// map.tsx's 15s background poll and refreshSegments both re-fetch these
// well within that window, so a URL going stale mid-session is rare. It
// can still happen (screen open through a slow/offline stretch), so each
// photo tracks its own load failure (keyed by the URL string itself, which
// changes on every re-fetch since the signature/expiry query params do —
// so a stale failure entry naturally stops matching once a fresh URL comes
// in, no reset effect needed) and shows a plain "unavailable" placeholder
// instead of silently rendering blank space.
export function SubjectPhotoModal({ visible, subjectName, photoUrls, onClose }: SubjectPhotoModalProps) {
  const { width } = useWindowDimensions();
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.sheet}>
          <SafeAreaView style={styles.content}>
            <View style={styles.titleRow}>
              <ThemedText type="subtitle">{subjectName}</ThemedText>
              {photoUrls.length > 1 && (
                <ThemedText type="small" themeColor="textSecondary">
                  {photoUrls.length} photos — swipe to see more
                </ThemedText>
              )}
            </View>

            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {photoUrls.map((url) =>
                failedUrls.has(url) ? (
                  <View key={url} style={[styles.photo, styles.photoUnavailable, { width }]}>
                    <ThemedText themeColor="textSecondary">Photo unavailable</ThemedText>
                  </View>
                ) : (
                  <Image
                    key={url}
                    source={{ uri: url }}
                    style={[styles.photo, { width }]}
                    contentFit="contain"
                    onError={() => setFailedUrls((prev) => new Set(prev).add(url))}
                  />
                ),
              )}
            </ScrollView>

            <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
          </SafeAreaView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
    maxHeight: '85%',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  titleRow: {
    gap: Spacing.one,
  },
  photo: {
    height: 320,
  },
  photoUnavailable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
