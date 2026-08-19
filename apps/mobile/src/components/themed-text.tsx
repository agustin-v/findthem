import { StyleSheet, Text, type TextProps } from 'react-native';

import { FontFamilies, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

// 'code' doubles as the small-caps mono meta-label style used throughout
// the design ("YOUR AREA", "MISSING 6H · RIVERSIDE PARK", "APPEARANCE") —
// unused as an actual monospace-code style anywhere in this app.

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontFamily: FontFamilies.sansMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontFamily: FontFamilies.sansBold,
    fontSize: 14,
    lineHeight: 20,
  },
  default: {
    fontFamily: FontFamilies.sansMedium,
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontFamily: FontFamilies.displayExtraBold,
    fontSize: 34,
    lineHeight: 40,
  },
  subtitle: {
    fontFamily: FontFamilies.display,
    fontSize: 24,
    lineHeight: 30,
  },
  link: {
    fontFamily: FontFamilies.sansMedium,
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    fontFamily: FontFamilies.sansSemiBold,
    lineHeight: 30,
    fontSize: 14,
    color: '#DD5A34',
  },
  code: {
    fontFamily: FontFamilies.mono,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
