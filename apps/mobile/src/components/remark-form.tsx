import * as Crypto from 'expo-crypto';
import { Eye, MapPin, StickyNote, TriangleAlert } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LocationConsentNotice } from '@/components/location-consent-notice';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useLocationPermission } from '@/hooks/useLocationPermission';
import { ApiError, createRemark, type RemarkKind } from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';
import { getCurrentCoords } from '@/lib/location';

const REMARK_KINDS: { value: RemarkKind; label: string; icon: typeof Eye }[] = [
  { value: 'sighting', label: 'Sighting', icon: Eye },
  { value: 'hazard', label: 'Hazard', icon: TriangleAlert },
  { value: 'note', label: 'Note', icon: StickyNote },
];

interface RemarkFormProps {
  visible: boolean;
  token: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export function RemarkForm({ visible, token, onClose, onSubmitted }: RemarkFormProps) {
  const theme = useTheme();
  const { status: locationStatus, request: requestLocation } = useLocationPermission();
  const [kind, setKind] = useState<RemarkKind>('sighting');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The modal is toggled via `visible`, not unmounted, so component state
  // (including `submitting`) survives between opens — resetting it only in
  // the error branch left it stuck `true` forever after the first success.
  // This ref also lets Cancel actually abort an in-flight submit (e.g. a
  // slow GPS fix) instead of just hiding the modal while it silently
  // finishes and files the report anyway.
  const cancelledRef = useRef(false);

  const handleClose = () => {
    cancelledRef.current = true;
    setKind('sighting');
    setText('');
    setError(null);
    setSubmitting(false);
    onClose();
  };

  const handleSubmit = async () => {
    cancelledRef.current = false;
    setSubmitting(true);
    setError(null);

    try {
      const coords = locationStatus === 'granted' ? await getCurrentCoords() : null;
      if (cancelledRef.current) return;

      await createRemark(token, {
        id: Crypto.randomUUID(),
        kind,
        text: text.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        reportedAt: new Date().toISOString(),
      });
      if (cancelledRef.current) return;

      handleClose();
      onSubmitted();
    } catch (err) {
      if (cancelledRef.current) return;
      setError(
        err instanceof ApiError
          ? 'Could not submit this report. Please try again.'
          : 'Something went wrong. Please check your connection and try again.',
      );
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.sheet}>
          <SafeAreaView>
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.sheetHandle} />
              <ThemedText type="subtitle">Report something</ThemedText>

              <ThemedText type="code" themeColor="textSecondary" style={styles.sectionTitle}>
                Type
              </ThemedText>
              <View style={styles.chipRow}>
                {REMARK_KINDS.map((option) => {
                  const selected = kind === option.value;
                  const Icon = option.icon;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setKind(option.value)}
                      style={[
                        styles.chip,
                        { backgroundColor: selected ? theme.primary : theme.backgroundSelected },
                      ]}>
                      <Icon color={selected ? theme.primaryText : theme.text} size={16} />
                      <ThemedText type="smallBold" style={{ color: selected ? theme.primaryText : theme.text }}>
                        {option.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <ThemedText type="code" themeColor="textSecondary" style={styles.sectionTitle}>
                Details · optional
              </ThemedText>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="What did you see?"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />

              {locationStatus === 'granted' ? (
                <View style={[styles.locationBanner, { backgroundColor: theme.successSoft }]}>
                  <MapPin color={theme.success} size={16} />
                  <ThemedText type="small" style={[styles.locationBannerText, { color: theme.success }]}>
                    Location on — this report will be pinned to where you are now.
                  </ThemedText>
                </View>
              ) : (
                locationStatus !== 'checking' && (
                  <LocationConsentNotice status={locationStatus} onRequest={requestLocation} />
                )
              )}

              {error && (
                <ThemedText type="small" style={styles.error}>
                  {error}
                </ThemedText>
              )}

              <PrimaryButton label="Send report" onPress={handleSubmit} loading={submitting} />
              <PrimaryButton label="Cancel" variant="secondary" onPress={handleClose} />
            </ScrollView>
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
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    maxHeight: '85%',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.35)',
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    marginTop: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    overflow: 'hidden',
  },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderRadius: Radius.input,
    padding: Spacing.three,
  },
  locationBannerText: {
    flex: 1,
  },
  error: {
    color: '#B3432B',
  },
});
