import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';

interface SubjectPhotoModalProps {
  visible: boolean;
  subjectName: string;
  photoUrls: string[];
  onClose: () => void;
}

// A dedicated dark full-bleed viewer, always dark regardless of the app's
// light/dark theme — deliberate contrast for viewing a subject photo, not
// something that should follow the paper-light theme used everywhere else.
//
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
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{subjectName}</Text>
              {photoUrls.length > 1 && (
                <Text style={styles.subtitle}>
                  {photoUrls.length} photos · swipe
                </Text>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.closeButton}>
              <X color="#ffffff" size={20} />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScroll}
            style={styles.scroll}>
            {photoUrls.map((url) =>
              failedUrls.has(url) ? (
                <View key={url} style={[styles.photo, styles.photoUnavailable, { width }]}>
                  <Text style={styles.subtitle}>Photo unavailable</Text>
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

          {photoUrls.length > 1 && (
            <View style={styles.dots}>
              {photoUrls.map((url, i) => (
                <View key={url} style={[styles.dot, i === activeIndex && styles.dotActive]} />
              ))}
            </View>
          )}

          <View style={styles.footer}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.footerButton}>
              <Text style={styles.footerButtonLabel}>Close</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#141210',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  title: {
    color: '#ffffff',
    fontFamily: 'BricolageGrotesque_600SemiBold',
    fontSize: 20,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'GeistMono_500Medium',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  scroll: {
    flex: 1,
  },
  photo: {
    flex: 1,
  },
  photoUnavailable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingBottom: Spacing.two,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: '#ffffff',
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  footerButton: {
    minHeight: 52,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerButtonLabel: {
    color: '#ffffff',
    fontFamily: 'HankenGrotesk_700Bold',
    fontSize: 14,
  },
});
