import { ActivityIndicator, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface PrimaryButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
}: PrimaryButtonProps) {
  const theme = useTheme();
  // A disabled primary button goes to the muted/peach tone from the
  // design rather than just dimming opacity — a loading (in-flight)
  // primary button stays full-strength since that's not a "can't submit"
  // state, just a "submitting" one.
  const isPrimaryMuted = variant === 'primary' && disabled && !loading;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary'
          ? { backgroundColor: isPrimaryMuted ? theme.primaryMuted : theme.primary }
          : { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.border },
        isDisabled && !isPrimaryMuted && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.primaryText : theme.text} />
      ) : (
        <ThemedText
          type="smallBold"
          style={{ color: variant === 'primary' ? theme.primaryText : theme.text }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});
