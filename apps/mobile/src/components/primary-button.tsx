import { ActivityIndicator, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

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
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#ffffff' : '#208AEF'} />
      ) : (
        <ThemedText
          type="smallBold"
          style={variant === 'primary' ? styles.primaryText : styles.secondaryText}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  primary: {
    backgroundColor: '#208AEF',
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#208AEF',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
  primaryText: {
    color: '#ffffff',
  },
  secondaryText: {
    color: '#208AEF',
  },
});
