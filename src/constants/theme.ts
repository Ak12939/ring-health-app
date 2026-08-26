/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const RingColors = {
  background: '#000000',
  canvas: '#090B12',
  card: '#121318',
  cardAlt: '#1A1A1E',
  surface: '#2A2A30',
  surfaceSoft: '#1F2128',
  text: '#FFFFFF',
  muted: '#8E8E93',
  border: '#1F2128',
  recovery: '#34D399',
  warning: '#F59E0B',
  danger: '#FF453A',
  strain: '#FC5200',
  sleep: '#00D2FF',
  protein: '#38BDF8',
  cyan: '#38BDF8',
  indigo: '#1E3A8A',
  emerald: '#34D399',
  white: '#FFFFFF',
} as const;

export const Colors = {
  light: {
    text: RingColors.text,
    background: RingColors.background,
    backgroundElement: RingColors.card,
    backgroundSelected: RingColors.surface,
    textSecondary: RingColors.muted,
  },
  dark: {
    text: RingColors.text,
    background: RingColors.background,
    backgroundElement: RingColors.card,
    backgroundSelected: RingColors.surface,
    textSecondary: RingColors.muted,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
