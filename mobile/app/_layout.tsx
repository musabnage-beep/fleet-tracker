import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { I18nManager } from 'react-native';
import { AuthProvider } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { AppSettingsProvider } from '../contexts/AppSettingsContext';

SplashScreen.preventAutoHideAsync();

// Enable RTL
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

function InnerLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_left',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="(employee)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Urbanist': require('../assets/fonts/Urbanist-VariableFont_wght.ttf'),
    'ExpoArabic-Light': require('../assets/fonts/ExpoArabic-Light.ttf'),
    'ExpoArabic-Book': require('../assets/fonts/ExpoArabic-Book.ttf'),
    'ExpoArabic-SemiBold': require('../assets/fonts/ExpoArabic-SemiBold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppSettingsProvider>
          <AuthProvider>
            <InnerLayout />
          </AuthProvider>
        </AppSettingsProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
