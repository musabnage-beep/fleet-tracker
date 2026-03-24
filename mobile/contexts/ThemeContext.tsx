import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark';

const lightColors = {
  primary: '#6EB1BE',
  primaryDark: '#5A9BAA',
  primaryLight: '#B5C0C6',
  secondary: '#B5C0C6',
  secondaryLight: '#E5EBF1',
  accent: '#EB8378',
  accentLight: '#EFF2F9',
  background: '#F0F3F6',
  surface: '#EFF2F9',
  surfaceDark: '#E5EBF1',
  white: '#FFFFFF',
  textDark: '#171b1d',
  textMedium: '#5A6268',
  textLight: '#B5C0C6',
  textOnPrimary: '#FFFFFF',
  success: '#8BC690',
  successLight: '#E8F5EC',
  warning: '#EB8378',
  warningLight: '#FDF0EF',
  danger: '#EB8378',
  dangerLight: '#FDF0EF',
  border: '#E5EBF1',
  shadow: 'rgba(23, 27, 29, 0.15)',
  overlay: 'rgba(23, 27, 29, 0.5)',
  card: '#FFFFFF',
  tabBar: '#FFFFFF',
  headerBg: '#6EB1BE',
};

const darkColors = {
  primary: '#6EB1BE',
  primaryDark: '#5A9BAA',
  primaryLight: '#4A8A96',
  secondary: '#3A4A52',
  secondaryLight: '#2A3A42',
  accent: '#EB8378',
  accentLight: '#3A2520',
  background: '#0F1315',
  surface: '#1A2025',
  surfaceDark: '#151A1E',
  white: '#1E2428',
  textDark: '#E8EAEC',
  textMedium: '#B5C0C6',
  textLight: '#5A6268',
  textOnPrimary: '#FFFFFF',
  success: '#8BC690',
  successLight: '#1A2E1C',
  warning: '#EB8378',
  warningLight: '#2E1A18',
  danger: '#EB8378',
  dangerLight: '#2E1A18',
  border: '#2A3438',
  shadow: 'rgba(0, 0, 0, 0.4)',
  overlay: 'rgba(0, 0, 0, 0.7)',
  card: '#1E2428',
  tabBar: '#151A1E',
  headerBg: '#151A1E',
};

type ThemeColors = typeof lightColors;

type ThemeContextType = {
  mode: ThemeMode;
  colors: ThemeColors;
  setTheme: (mode: ThemeMode) => Promise<void>;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  colors: lightColors,
  setTheme: async () => {},
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem('app_theme').then((saved) => {
      if (saved === 'dark' || saved === 'light') setMode(saved);
    });
  }, []);

  const setTheme = async (newMode: ThemeMode) => {
    setMode(newMode);
    await AsyncStorage.setItem('app_theme', newMode);
  };

  const colors = mode === 'dark' ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ mode, colors, setTheme, isDark: mode === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
