/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// "Warm paper" system (rescue-orange brand, volunteer-green approval) —
// background is a warm off-white paper tone, cards/sheets sit on white,
// borders/text lean warm-gray rather than neutral-gray to match.
export const Colors = {
  light: {
    text: '#1C1A17',
    background: '#F2EEE5',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#FAF7F1',
    textSecondary: '#78736A',
    border: '#E6DFD1',
    primary: '#E4571B',
    primaryText: '#FFFFFF',
    primarySoft: '#FCEDE3',
    primaryMuted: '#F3C9AE',
    success: '#2F7D42',
    successSoft: '#EFF6F0',
    warning: '#B27B12',
    warningSoft: '#FDF5E7',
    error: '#DC2626',
    errorSoft: '#FDEDEA',
    privacy: '#6D4AC2',
    privacySoft: '#F4F0FB',
  },
  dark: {
    text: '#F3EDE2',
    background: '#1C1A17',
    backgroundElement: '#26231F',
    backgroundSelected: '#332E28',
    textSecondary: '#B5AC9E',
    border: '#3A352E',
    primary: '#E8703F',
    primaryText: '#FFFFFF',
    primarySoft: '#3A2A22',
    primaryMuted: '#5A3A2C',
    success: '#4FAE79',
    successSoft: '#1E3A2A',
    warning: '#D9A441',
    warningSoft: '#3A2F19',
    error: '#E08066',
    errorSoft: '#3A241D',
    privacy: '#A98CE0',
    privacySoft: '#2B2438',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Bricolage Grotesque (display/headings), Hanken Grotesk (body/UI),
// Geist Mono (small-caps meta labels, codes) — loaded via
// @expo-google-fonts/* in app/_layout.tsx. Each weight is its own font
// family name (RN can't fake weights on variable fonts from a static
// .ttf), so these are exact family names, not CSS-style weight knobs.
export const FontFamilies = {
  display: 'BricolageGrotesque_700Bold',
  displaySemiBold: 'BricolageGrotesque_600SemiBold',
  displayExtraBold: 'BricolageGrotesque_800ExtraBold',
  sans: 'HankenGrotesk_400Regular',
  sansMedium: 'HankenGrotesk_500Medium',
  sansSemiBold: 'HankenGrotesk_600SemiBold',
  sansBold: 'HankenGrotesk_700Bold',
  mono: 'GeistMono_500Medium',
  monoSemiBold: 'GeistMono_600SemiBold',
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// Unified pill buttons (999px) throughout, large-radius cards/sheets,
// smaller radius for inputs/chips — matches the design system's shape scale.
export const Radius = {
  pill: 999,
  card: 24,
  sheet: 28,
  input: 16,
  chip: 14,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
