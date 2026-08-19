import { StyleSheet, Switch, View } from 'react-native';

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
    <View style={styles.row}>
      <ThemedText type="default" style={styles.label}>
        {label}
      </ThemedText>
      <Switch
        value={checked}
        onValueChange={onToggle}
        trackColor={{ false: theme.border, true: theme.privacy }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  label: {
    flex: 1,
  },
});
