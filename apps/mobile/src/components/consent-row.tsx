import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ConsentRowProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
}

export function ConsentRow({ label, checked, onToggle }: ConsentRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={styles.row}>
      <View
        style={[
          styles.box,
          { borderColor: theme.textSecondary },
          checked && { backgroundColor: '#208AEF', borderColor: '#208AEF' },
        ]}>
        {checked && <ThemedText style={styles.check}>✓</ThemedText>}
      </View>
      <ThemedText type="small" style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  check: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 16,
  },
  label: {
    flex: 1,
  },
});
