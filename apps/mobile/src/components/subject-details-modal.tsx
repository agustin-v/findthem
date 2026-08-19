import { Image } from 'expo-image';
import { MessageCircle, Phone } from 'lucide-react-native';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { VolunteerSearchInfo } from '@/lib/api';

interface SubjectDetailsModalProps {
  visible: boolean;
  search: VolunteerSearchInfo;
  onClose: () => void;
  onOpenPhotos: () => void;
  onOpenChat: () => void;
  unreadMessageCount: number;
}

// subject_details is a free-form JSON map on the backend (its shape
// depends on subject_type — person/animal/object each capture different
// fields via apps/ui's wizard) — this maps the keys that flow can produce
// to a friendly label, in display order. Anything else present but not
// listed here still renders, just with its raw key as the label, so a
// coordinator-entered field never silently disappears.
const SHORT_FIELDS: { key: string; label: string }[] = [
  { key: 'age', label: 'Age' },
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Weight' },
  { key: 'speciesBreed', label: 'Species / breed' },
  { key: 'microchip', label: 'Microchip' },
];

const LONG_FIELDS: { key: string; label: string }[] = [
  { key: 'physicalDescription', label: 'Appearance' },
  { key: 'description', label: 'Description' },
  { key: 'generalDescription', label: 'About' },
  { key: 'behaviourNotes', label: 'Behavior notes' },
  { key: 'healthNotes', label: 'Health notes' },
  { key: 'intendedDestination', label: 'Intended destination' },
];

const KNOWN_KEYS = new Set([...SHORT_FIELDS, ...LONG_FIELDS].map((f) => f.key));

function humanizeKey(key: string): string {
  const withSpaces = key.replace(/([a-z])([A-Z])/g, '$1 $2');
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase();
}

function hasValue(details: Record<string, unknown>, key: string): boolean {
  const value = details[key];
  return value != null && String(value).trim().length > 0;
}

function formatElapsed(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return 'just now';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return `${Math.floor(ms / 60000)}m`;
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function SubjectDetailsModal({
  visible,
  search,
  onClose,
  onOpenPhotos,
  onOpenChat,
  unreadMessageCount,
}: SubjectDetailsModalProps) {
  const theme = useTheme();
  const details = search.subjectDetails;
  const elapsed = formatElapsed(search.lkpAt);

  const shortRows = SHORT_FIELDS.filter((f) => hasValue(details, f.key));
  const longRows = LONG_FIELDS.filter((f) => hasValue(details, f.key));
  const extraKeys = Object.keys(details).filter((key) => !KNOWN_KEYS.has(key) && hasValue(details, key));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.sheet}>
          <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.sheetHandle} />

              <View style={styles.titleRow}>
                <ThemedText type="subtitle">{search.subjectName}</ThemedText>
                {elapsed && (
                  <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
                    <ThemedText type="small" style={{ color: theme.primary }}>
                      Missing {elapsed}
                    </ThemedText>
                  </View>
                )}
              </View>
              {search.lkpAddress && (
                <ThemedText themeColor="textSecondary">Last seen near {search.lkpAddress}</ThemedText>
              )}

              {search.photoUrls.length > 0 && (
                <>
                  <ThemedText type="code" themeColor="textSecondary" style={styles.sectionLabel}>
                    Photos · tap to enlarge
                  </ThemedText>
                  <View style={styles.photoRow}>
                    {search.photoUrls.map((url) => (
                      <Pressable
                        key={url}
                        accessibilityRole="button"
                        accessibilityLabel="View photo"
                        style={styles.photoThumbWrap}
                        onPress={onOpenPhotos}>
                        <Image source={{ uri: url }} style={styles.photoThumb} contentFit="cover" />
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {(shortRows.length > 0 || longRows.length > 0 || extraKeys.length > 0) && (
                <>
                  <ThemedText type="code" themeColor="textSecondary" style={styles.sectionLabel}>
                    Appearance
                  </ThemedText>
                  <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
                    {shortRows.map((field, i) => (
                      <View key={field.key}>
                        {i > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
                        <View style={styles.fieldRow}>
                          <ThemedText themeColor="textSecondary">{field.label}</ThemedText>
                          <ThemedText type="smallBold">{String(details[field.key])}</ThemedText>
                        </View>
                      </View>
                    ))}
                    {longRows.map((field) => (
                      <View key={field.key}>
                        {(shortRows.length > 0 || longRows.indexOf(field) > 0) && (
                          <View style={[styles.divider, { backgroundColor: theme.border }]} />
                        )}
                        <View style={styles.fieldBlock}>
                          <ThemedText themeColor="textSecondary">{field.label}</ThemedText>
                          <ThemedText>{String(details[field.key])}</ThemedText>
                        </View>
                      </View>
                    ))}
                    {extraKeys.map((key) => (
                      <View key={key}>
                        <View style={[styles.divider, { backgroundColor: theme.border }]} />
                        <View style={styles.fieldBlock}>
                          <ThemedText themeColor="textSecondary">{humanizeKey(key)}</ThemedText>
                          <ThemedText>{String(details[key])}</ThemedText>
                        </View>
                      </View>
                    ))}
                  </ThemedView>
                </>
              )}

              {search.contactPhone && (
                <>
                  <ThemedText type="code" themeColor="textSecondary" style={styles.sectionLabel}>
                    Coordinator
                  </ThemedText>
                  <ThemedView
                    type="backgroundElement"
                    style={[styles.card, styles.coordinatorRow, { borderColor: theme.border }]}>
                    <ThemedText themeColor="textSecondary">Contact for this search</ThemedText>
                    <View style={styles.coordinatorActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          unreadMessageCount > 0 ? `Chat, ${unreadMessageCount} unread` : 'Chat'
                        }
                        style={[styles.iconButton, { backgroundColor: theme.primarySoft }]}
                        onPress={onOpenChat}>
                        <MessageCircle color={theme.primary} size={18} />
                        {unreadMessageCount > 0 && (
                          <View style={[styles.iconButtonBadge, { backgroundColor: theme.primary }]}>
                            <ThemedText type="small" style={styles.iconButtonBadgeText}>
                              {unreadMessageCount}
                            </ThemedText>
                          </View>
                        )}
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        style={[styles.iconButton, { backgroundColor: theme.primarySoft }]}
                        onPress={() => Linking.openURL(`tel:${search.contactPhone}`)}>
                        <Phone color={theme.primary} size={18} />
                      </Pressable>
                    </View>
                  </ThemedView>
                </>
              )}

              <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
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
    maxHeight: '88%',
  },
  safeArea: {
    flexShrink: 1,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  photoRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  photoThumbWrap: {
    flex: 1,
    aspectRatio: 1.4,
    borderRadius: Radius.chip,
    overflow: 'hidden',
  },
  photoThumb: {
    flex: 1,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.input,
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  fieldBlock: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: 2,
  },
  divider: {
    height: 1,
  },
  coordinatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  coordinatorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  iconButtonBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 12,
  },
});
