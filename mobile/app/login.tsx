import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAppSettings } from '../contexts/AppSettingsContext';

export default function LoginScreen() {
  const { t, isRTL, lang, setLanguage } = useLanguage();
  const { colors, mode, setTheme } = useTheme();
  const { appName, companyName, logo } = useAppSettings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    getDeviceId();
  }, []);

  const getDeviceId = async () => {
    try {
      if (Platform.OS === 'android') {
        const id = Application.getAndroidId();
        if (id) setDeviceId(id);
      } else {
        const id = await Application.getIosIdForVendorAsync();
        if (id) setDeviceId(id);
      }
    } catch (e) {
      // Device ID not available
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert(t('alert'), t('enterUsernamePassword'));
      return;
    }
    setLoading(true);
    try {
      const user = await login(username.trim(), password, deviceId);
      if (user.role === 'admin') {
        router.replace('/(admin)');
      } else {
        router.replace('/(employee)');
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Top Bar - Language & Theme */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.topBtn, { backgroundColor: colors.card }]}
          onPress={() => setLanguage(lang === 'ar' ? 'en' : 'ar')}
        >
          <Ionicons name="globe-outline" size={20} color={colors.primary} />
          <Text style={[styles.topBtnText, { color: colors.primary }]}>{lang === 'ar' ? 'EN' : 'عربي'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.topBtn, { backgroundColor: colors.card }]}
          onPress={() => setTheme(mode === 'light' ? 'dark' : 'light')}
        >
          <Ionicons name={mode === 'light' ? 'moon-outline' : 'sunny-outline'} size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Logo Area */}
        <View style={styles.logoContainer}>
          {logo ? (
            <Image source={{ uri: `data:image/png;base64,${logo}` }} style={styles.logoImage} />
          ) : (
            <View style={[styles.logoCircle, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
              <Ionicons name="car-sport" size={48} color={colors.textOnPrimary} />
            </View>
          )}
          <Text style={[styles.appName, { color: colors.primary }]}>{appName}</Text>
          <Text style={[styles.companyName, { color: colors.textMedium }]}>{companyName}</Text>
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="person-outline" size={22} color={colors.primary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textDark, textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={t('username')}
              placeholderTextColor={colors.textLight}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={22} color={colors.primary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textDark, textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={t('password')}
              placeholderTextColor={colors.textLight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={colors.textLight}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary, shadowColor: colors.primary }, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>{t('login')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={[styles.version, { color: colors.textLight }]}>{t('version')}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
  },
  topBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  topBtnText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 13 },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontFamily: 'Urbanist',
    fontWeight: '900',
    letterSpacing: 1,
  },
  companyName: {
    fontSize: 16,
    fontFamily: 'ExpoArabic-Light',
    marginTop: 4,
  },
  form: { gap: 16 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: { marginLeft: 12 },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'ExpoArabic-Book',
    paddingHorizontal: 12,
  },
  eyeIcon: { padding: 4 },
  button: {
    borderRadius: 14,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { fontSize: 18, fontFamily: 'ExpoArabic-SemiBold' },
  version: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 12,
    fontFamily: 'ExpoArabic-Light',
  },
});
