import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { APP_CONFIG } from '../../constants/config';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { t, lang, setLanguage } = useLanguage();
  const { colors, mode, setTheme, isDark } = useTheme();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert(t('logout'), t('logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'), style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color={colors.textOnPrimary} />
        </View>
        <Text style={[styles.name, { color: colors.textOnPrimary }]}>{user?.name}</Text>
        <Text style={styles.role}>{t('employeeRole')}</Text>
        <Text style={styles.username}>@{user?.username}</Text>
      </View>

      {/* App Settings - Language & Theme */}
      <View style={[styles.settingsCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsTitle, { color: colors.textDark }]}>{t('appSettings')}</Text>

        {/* Language Toggle */}
        <View style={styles.settingRow}>
          <View style={styles.settingLabel}>
            <Ionicons name="language-outline" size={18} color={colors.primary} />
            <Text style={[styles.settingText, { color: colors.textDark }]}>{t('language')}</Text>
          </View>
          <View style={[styles.toggleContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.toggleBtn, lang === 'ar' && { backgroundColor: colors.primary }]}
              onPress={() => setLanguage('ar')}
            >
              <Text style={[styles.toggleText, { color: lang === 'ar' ? colors.textOnPrimary : colors.textMedium }]}>{t('arabic')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, lang === 'en' && { backgroundColor: colors.primary }]}
              onPress={() => setLanguage('en')}
            >
              <Text style={[styles.toggleText, { color: lang === 'en' ? colors.textOnPrimary : colors.textMedium }]}>{t('english')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Theme Toggle */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.settingRow}>
          <View style={styles.settingLabel}>
            <Ionicons name={isDark ? 'moon-outline' : 'sunny-outline'} size={18} color={colors.primary} />
            <Text style={[styles.settingText, { color: colors.textDark }]}>{t('theme')}</Text>
          </View>
          <View style={[styles.toggleContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.toggleBtn, !isDark && { backgroundColor: colors.primary }]}
              onPress={() => setTheme('light')}
            >
              <Text style={[styles.toggleText, { color: !isDark ? colors.textOnPrimary : colors.textMedium }]}>{t('lightMode')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, isDark && { backgroundColor: colors.primary }]}
              onPress={() => setTheme('dark')}
            >
              <Text style={[styles.toggleText, { color: isDark ? colors.textOnPrimary : colors.textMedium }]}>{t('darkMode')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textMedium }]}>{t('server')}</Text>
          <Text style={[styles.infoValue, { color: colors.primary }]}>{APP_CONFIG.serverUrl}</Text>
        </View>
      </View>

      <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: colors.dangerLight }]} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={[styles.logoutText, { color: colors.danger }]}>{t('logout')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  profileCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  name: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 22 },
  role: { fontFamily: 'ExpoArabic-Light', fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  username: { fontFamily: 'Urbanist', fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  settingsCard: {
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    elevation: 2,
  },
  settingsTitle: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 15, marginBottom: 14 },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  settingLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 14 },
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    margin: 2,
  },
  toggleText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 12 },
  divider: { height: 1, marginVertical: 8 },
  infoCard: {
    borderRadius: 14,
    padding: 18,
    marginBottom: 24,
    elevation: 2,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { fontFamily: 'ExpoArabic-Book', fontSize: 14 },
  infoValue: { fontFamily: 'Urbanist', fontSize: 14, fontWeight: '600' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    height: 52,
  },
  logoutText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
});
