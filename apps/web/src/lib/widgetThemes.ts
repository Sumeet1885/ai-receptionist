import { WidgetTheme } from '../types';

export interface WidgetThemePreset {
  id: string;
  name: string;
  description: string;
  theme: WidgetTheme;
  primaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
}

export const widgetThemePresets: WidgetThemePreset[] = [
  {
    id: 'executive',
    name: 'Executive',
    description: 'Deep navy & clear blue',
    theme: 'dark',
    primaryColor: '#5B8CFF',
    backgroundColor: '#08111F',
    surfaceColor: '#101C2E',
    textColor: '#F4F7FB',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Charcoal & muted gold',
    theme: 'dark',
    primaryColor: '#D7B56D',
    backgroundColor: '#101114',
    surfaceColor: '#1A1C20',
    textColor: '#F7F3EA',
  },
  {
    id: 'porcelain',
    name: 'Porcelain',
    description: 'Crisp white & navy blue',
    theme: 'light',
    primaryColor: '#1D4ED8',
    backgroundColor: '#F3F6FA',
    surfaceColor: '#FFFFFF',
    textColor: '#172033',
  },
  {
    id: 'evergreen',
    name: 'Evergreen',
    description: 'Forest depth & soft mint',
    theme: 'brand',
    primaryColor: '#5FD6A5',
    backgroundColor: '#071A15',
    surfaceColor: '#0E2A22',
    textColor: '#EDF9F4',
  },
  {
    id: 'warm-sand',
    name: 'Warm Sand',
    description: 'Warm ivory & refined umber',
    theme: 'light',
    primaryColor: '#8B5E3C',
    backgroundColor: '#F4EFE7',
    surfaceColor: '#FFFDF9',
    textColor: '#2D241D',
  },
];

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const value = hex.slice(1);
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return 0.2126 * channelToLinear(red)
    + 0.7152 * channelToLinear(green)
    + 0.0722 * channelToLinear(blue);
}

export function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

type PaletteTokens = Pick<
  WidgetThemePreset,
  'theme' | 'primaryColor' | 'backgroundColor' | 'surfaceColor' | 'textColor'
>;

export function isThemePresetActive(
  preset: WidgetThemePreset,
  config: PaletteTokens,
): boolean {
  return preset.theme === config.theme
    && preset.primaryColor.toLowerCase() === config.primaryColor.toLowerCase()
    && preset.backgroundColor.toLowerCase() === config.backgroundColor.toLowerCase()
    && preset.surfaceColor.toLowerCase() === config.surfaceColor.toLowerCase()
    && preset.textColor.toLowerCase() === config.textColor.toLowerCase();
}

