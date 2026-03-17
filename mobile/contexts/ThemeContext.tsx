import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark';

const lightColors = {
  primary: '#588593',
  primaryDark: '#3d6470',
  primaryLight: '#7aa3b0',
  secondary: '#a7cbca',
  secondaryLight: '#c8dfde',
  accent: '#f66688',
  accentLight: '#f8899f',
  background: '#ebf5fc',
  surface: '#ebf7f6',
  surfaceDark: '#dff1f4',
  white: '#ffffff',
  textDark: '#2f3004',
  textMedium: '#5a5c3a',
  textLight: '#8a8c6a',
  textOnPrimary: '#ffffff',
  success: '#4CAF50',
  successLight: '#E8F5E9',
  warning: '#FF9800',
  warningLight: '#FFF3E0',
  danger: '#F44336',
  dangerLight: '#FFEBEE',
  border: '#d0e5e4',
  shadow: 'rgba(88, 133, 147, 0.15)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  card: '#ffffff',
  tabBar: '#ffffff',
  headerBg: '#588593',
};

const darkColors = {
  primary: '#6fa8b8',
  primaryDark: '#588593',
  primaryLight: '#8fc0cc',
  secondary: '#3d6470',
  secondaryLight: '#4a7a88',
  accent: '#f66688',
  accentLight: '#5a2030',
  background: '#0f1a1e',
  surface: '#1a2a30',
  surfaceDark: '#152228',
  white: '#1e2e35',
  textDark: '#e8eaec',
  textMedium: '#a0b0b8',
  textLight: '#6a8090',
  textOnPrimary: '#ffffff',
  success: '#66BB6A',
  successLight: '#1a2e1a',
  warning: '#FFB74D',
  warningLight: '#2e2510',
  danger: '#EF5350',
  dangerLight: '#2e1515',
  border: '#2a3a42',
  shadow: 'rgba(0, 0, 0, 0.3)',
  overlay: 'rgba(0, 0, 0, 0.7)',
  card: '#1e2e35',
  tabBar: '#152228',
  headerBg: '#152228',
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
