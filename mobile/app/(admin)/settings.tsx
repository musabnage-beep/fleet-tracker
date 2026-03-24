import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, TextInput, Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { APP_CONFIG } from '../../constants/config';
import { useAuth } from '../../contexts/AuthContext';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import {
  getUsers, createUser, deleteUser, resetUserDevice,
  updateAppSettings, uploadLogo, getAnprSettings, updateAnprToken,
  updateUserPassword,   // Fix #9
} from '../../services/api';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { t, isRTL, lang, setLanguage } = useLanguage();
  const { colors, mode, setTheme } = useTheme();
  const { appName, companyName, logo, refreshSettings } = useAppSettings();
  const router = useRouter();

  const [users, setUsers] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Add user modal
  const [modalVisible, setModalVisible] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'employee'>('employee');
  const [saving, setSaving] = useState(false);

  // App customization modal
  const [customizeModal, setCustomizeModal] = useState(false);
  const [editAppName, setEditAppName] = useState('');
  const [editCompanyName, setEditCompanyName] = useState('');

  // ANPR modal
  const [anprToken, setAnprToken] = useState('');
  const [anprHasToken, setAnprHasToken] = useState(false);
  const [anprModal, setAnprModal] = useState(false);
  const [savingAnpr, setSavingAnpr] = useState(false);

  // Fix #9: change-password modal state
  const [changePwModal, setChangePwModal] = useState(false);
  const [changePwUser, setChangePwUser] = useState<any>(null);
  const [changePwValue, setChangePwValue] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const loadAnprSettings = async () => {
    try {
      const data = await getAnprSettings();
      setAnprHasToken(data.hasToken);
    } catch (e) {}
  };

  const handleSaveAnprToken = async () => {
    if (!anprToken.trim()) {
      Alert.alert(t('alert'), t('allFieldsRequired'));
      return;
    }
    setSavingAnpr(true);
    try {
      await updateAnprToken(anprToken.trim());
      setAnprHasToken(true);
      setAnprModal(false);
      setAnprToken('');
      Alert.alert(t('success'), t('anprTokenSaved'));
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setSavingAnpr(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (e) {}
  };

  useFocusEffect(useCallback(() => { loadUsers(); loadAnprSettings(); }, []));

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

  const handleAddUser = async () => {
    if (!newUsername.trim() || !newPassword.trim() || !newName.trim()) {
      Alert.alert(t('alert'), t('allFieldsRequired'));
      return;
    }
    setSaving(true);
    try {
      await createUser({
        username: newUsername.trim(),
        password: newPassword.trim(),
        name: newName.trim(),
        role: newRole,
      });
      setModalVisible(false);
      setNewUsername('');
      setNewPassword('');
      setNewName('');
      await loadUsers();
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustomize = async () => {
    setSaving(true);
    try {
      await updateAppSettings({ appName: editAppName, companyName: editCompanyName });
      await refreshSettings();
      setCustomizeModal(false);
      Alert.alert(t('success') || 'نجح', t('settingsSaved') || 'تم حفظ الإعدادات');
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        await uploadLogo(result.assets[0].base64);
        await refreshSettings();
        Alert.alert(t('success') || 'نجح', t('logoUpdated') || 'تم تحديث الشعار');
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleResetDevice = (u: any) => {
    Alert.alert(
      t('resetDevice') || 'إعادة تعيين الجهاز',
      `${t('resetDeviceConfirm') || 'هل تريد إعادة تعيين جهاز'} "${u.name}"?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('reset') || 'إعادة تعيين',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetUserDevice(u.id);
              await loadUsers();
              Alert.alert(t('success') || 'نجح', t('deviceResetSuccess') || 'تم إعادة تعيين الجهاز');
            } catch (e: any) {
              Alert.alert(t('error'), e.message);
            }
          },
        },
      ]
    );
  };

  const handleDeleteUser = (u: any) => {
    Alert.alert(t('deleteUser'), `${t('deleteUserConfirm')} "${u.name}"?`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          try {
            await deleteUser(u.id);
            await loadUsers();
          } catch (e: any) {
            Alert.alert(t('error'), e.message);
          }
        },
      },
    ]);
  };

  // Fix #9: change password handler
  const openChangePassword = (u: any) => {
    setChangePwUser(u);
    setChangePwValue('');
    setChangePwModal(true);
  };

  const handleChangePassword = async () => {
    if (!changePwValue.trim()) {
      Alert.alert(t('alert'), t('allFieldsRequired') || 'Please enter a password');
      return;
    }
    setSavingPw(true);
    try {
      await updateUserPassword(changePwUser.id, changePwValue.trim());
      setChangePwModal(false);
      setChangePwValue('');
      Alert.alert(t('success') || 'Success', t('passwordChanged') || 'Password updated successfully');
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await loadUsers(); setRefreshing(false); }}
          colors={[colors.primary]}
        />
      }
    >
      {/* Profile Card */}
      <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color={colors.textOnPrimary} />
        </View>
        <View>
          <Text style={[styles.profileName, { color: colors.textOnPrimary }]}>{user?.name}</Text>
          <Text style={[styles.profileRole, { writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('systemAdmin')}</Text>
        </View>
      </View>

      {/* App Customization */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textDark, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('appCustomization') || 'تخصيص التطبيق'}</Text>
        <View style={[styles.infoCard, { backgroundColor: colors.card, alignItems: 'center', gap: 12 }]}>
          {logo ? (
            <Image source={{ uri: `data:image/png;base64,${logo}` }} style={{ width: 60, height: 60, borderRadius: 30 }} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Ionicons name="car-sport" size={28} color={colors.textOnPrimary} />
            </View>
          )}
          <Text style={[styles.infoValue, { color: colors.textDark, fontSize: 16 }]}>{appName}</Text>
          <Text style={[styles.infoLabel, { color: colors.textMedium }]}>{companyName}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setEditAppName(appName); setEditCompanyName(companyName); setCustomizeModal(true); }}
            >
              <Ionicons name="create-outline" size={16} color={colors.textOnPrimary} />
              <Text style={[styles.addBtnText, { color: colors.textOnPrimary }]}>{t('editName') || 'تعديل الاسم'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#28a745' }]} onPress={handleChangeLogo}>
              <Ionicons name="image-outline" size={16} color="#fff" />
              <Text style={[styles.addBtnText, { color: '#fff' }]}>{t('changeLogo') || 'تغيير الشعار'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Server Info */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textDark, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('serverInfo')}</Text>
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textMedium }]}>{t('serverAddress')}</Text>
            <Text style={[styles.infoValue, { color: colors.primary }]}>{APP_CONFIG.serverUrl}</Text>
          </View>
        </View>
      </View>

      {/* ANPR Settings */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textDark, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('anprSettings')}</Text>
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textMedium }]}>{t('anprStatus')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: anprHasToken ? colors.success : colors.danger }} />
              <Text style={[styles.infoValue, { color: anprHasToken ? colors.success : colors.danger }]}>
                {anprHasToken ? t('anprConnected') : t('anprNotConfigured')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary, marginTop: 12, alignSelf: 'flex-start' }]}
            onPress={() => setAnprModal(true)}
          >
            <Ionicons name="key-outline" size={16} color={colors.textOnPrimary} />
            <Text style={[styles.addBtnText, { color: colors.textOnPrimary }]}>
              {anprHasToken ? t('anprUpdateToken') : t('anprSetToken')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* App Settings - Language & Theme */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textDark, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('appSettings')}</Text>
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.settingLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('language')}</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, { backgroundColor: colors.surface, borderColor: colors.border }, lang === 'ar' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setLanguage('ar')}
            >
              <Text style={[styles.toggleBtnText, { color: colors.textMedium }, lang === 'ar' && { color: colors.textOnPrimary }]}>{t('arabic')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, { backgroundColor: colors.surface, borderColor: colors.border }, lang === 'en' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setLanguage('en')}
            >
              <Text style={[styles.toggleBtnText, { color: colors.textMedium }, lang === 'en' && { color: colors.textOnPrimary }]}>{t('english')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.settingLabel, { color: colors.textMedium, marginTop: 16, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('theme')}</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, { backgroundColor: colors.surface, borderColor: colors.border }, mode === 'light' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setTheme('light')}
            >
              <Ionicons name="sunny-outline" size={16} color={mode === 'light' ? colors.textOnPrimary : colors.textMedium} />
              <Text style={[styles.toggleBtnText, { color: colors.textMedium }, mode === 'light' && { color: colors.textOnPrimary }]}>{t('lightMode')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, { backgroundColor: colors.surface, borderColor: colors.border }, mode === 'dark' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setTheme('dark')}
            >
              <Ionicons name="moon-outline" size={16} color={mode === 'dark' ? colors.textOnPrimary : colors.textMedium} />
              <Text style={[styles.toggleBtnText, { color: colors.textMedium }, mode === 'dark' && { color: colors.textOnPrimary }]}>{t('darkMode')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Users Management */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textDark, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('userManagement')}</Text>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setModalVisible(true)}>
            <Ionicons name="add" size={20} color={colors.textOnPrimary} />
            <Text style={[styles.addBtnText, { color: colors.textOnPrimary }]}>{t('add')}</Text>
          </TouchableOpacity>
        </View>
        {users.map(u => (
          <View key={u.id} style={[styles.userCard, { backgroundColor: colors.card }]}>
            <View style={styles.userInfo}>
              <Ionicons
                name={u.role === 'admin' ? 'shield-checkmark' : 'person'}
                size={20}
                color={u.role === 'admin' ? colors.accent : colors.primary}
              />
              <View>
                <Text style={[styles.userNameText, { color: colors.textDark }]}>{u.name}</Text>
                <Text style={[styles.userRoleText, { color: colors.textMedium }]}>
                  @{u.username} {'\u2022'} {u.role === 'admin' ? t('admin') : t('employeeRoleName')}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {u.device_id && (
                <TouchableOpacity onPress={() => handleResetDevice(u)}>
                  <Ionicons name="phone-portrait-outline" size={18} color={colors.warning} />
                </TouchableOpacity>
              )}
              {/* Fix #9: Change password button */}
              <TouchableOpacity onPress={() => openChangePassword(u)}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
              {u.id !== user?.id && (
                <TouchableOpacity onPress={() => handleDeleteUser(u)}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Logout */}
      <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: colors.dangerLight }]} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={[styles.logoutText, { color: colors.danger }]}>{t('logout')}</Text>
      </TouchableOpacity>

      {/* ── Customize Modal ───────────────────────────────────────────────── */}
      <Modal visible={customizeModal} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.textDark }]}>{t('appCustomization') || 'تخصيص التطبيق'}</Text>
            <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('appNameLabel') || 'اسم التطبيق'}</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textDark, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]}
              value={editAppName}
              onChangeText={setEditAppName}
            />
            <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('companyNameLabel') || 'اسم الشركة'}</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textDark, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]}
              value={editCompanyName}
              onChangeText={setEditCompanyName}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={() => setCustomizeModal(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMedium }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.7 }]}
                onPress={handleSaveCustomize}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={colors.textOnPrimary} size="small" /> : <Text style={[styles.saveBtnText, { color: colors.textOnPrimary }]}>{t('save')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── ANPR Token Modal ──────────────────────────────────────────────── */}
      <Modal visible={anprModal} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.textDark }]}>{t('anprSettings')}</Text>
            <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('anprTokenLabel')}</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textDark, borderColor: colors.border, textAlign: 'left' }]}
              value={anprToken}
              onChangeText={setAnprToken}
              placeholder="xxxxxxxxxxxxxxxx"
              placeholderTextColor={colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.fieldLabel, { color: colors.textLight, fontSize: 12, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('anprTokenHint')}</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={() => { setAnprModal(false); setAnprToken(''); }}>
                <Text style={[styles.cancelBtnText, { color: colors.textMedium }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }, savingAnpr && { opacity: 0.7 }]}
                onPress={handleSaveAnprToken}
                disabled={savingAnpr}
              >
                {savingAnpr ? <ActivityIndicator color={colors.textOnPrimary} size="small" /> : <Text style={[styles.saveBtnText, { color: colors.textOnPrimary }]}>{t('save')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add User Modal ────────────────────────────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.textDark, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('addNewUser')}</Text>

            <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('fullName')} *</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textDark, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]}
              value={newName}
              onChangeText={setNewName}
              placeholder={t('fullName')}
              placeholderTextColor={colors.textLight}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('username')} *</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textDark, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]}
              value={newUsername}
              onChangeText={setNewUsername}
              placeholder={t('username')}
              placeholderTextColor={colors.textLight}
              autoCapitalize="none"
            />

            <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('password')} *</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textDark, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t('password')}
              placeholderTextColor={colors.textLight}
              secureTextEntry
            />

            <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('role')}</Text>
            <View style={styles.roleSelector}>
              <TouchableOpacity
                style={[styles.roleBtn, { backgroundColor: colors.surface, borderColor: colors.border }, newRole === 'employee' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setNewRole('employee')}
              >
                <Text style={[styles.roleBtnText, { color: colors.textMedium }, newRole === 'employee' && { color: colors.textOnPrimary }]}>{t('employeeRoleName')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleBtn, { backgroundColor: colors.surface, borderColor: colors.border }, newRole === 'admin' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setNewRole('admin')}
              >
                <Text style={[styles.roleBtnText, { color: colors.textMedium }, newRole === 'admin' && { color: colors.textOnPrimary }]}>{t('admin')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={() => setModalVisible(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMedium }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.7 }]}
                onPress={handleAddUser}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={colors.textOnPrimary} size="small" /> : <Text style={[styles.saveBtnText, { color: colors.textOnPrimary }]}>{t('add')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Fix #9: Change Password Modal ────────────────────────────────── */}
      <Modal visible={changePwModal} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.textDark }]}>
              {t('changePassword') || 'Change Password'}
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.textMedium }]}>
              {changePwUser?.name}  (@{changePwUser?.username})
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.textMedium, marginTop: 12, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>
              {t('newPassword') || 'New password'} *
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textDark, borderColor: colors.border, textAlign: 'left' }]}
              value={changePwValue}
              onChangeText={setChangePwValue}
              placeholder={t('newPassword') || 'New password'}
              placeholderTextColor={colors.textLight}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => { setChangePwModal(false); setChangePwValue(''); }}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textMedium }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }, savingPw && { opacity: 0.7 }]}
                onPress={handleChangePassword}
                disabled={savingPw}
              >
                {savingPw
                  ? <ActivityIndicator color={colors.textOnPrimary} size="small" />
                  : <Text style={[styles.saveBtnText, { color: colors.textOnPrimary }]}>{t('save')}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  profileCard: {
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileName: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 18 },
  profileRole: { fontFamily: 'ExpoArabic-Light', fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16, marginBottom: 12 },
  infoCard: { borderRadius: 12, padding: 16, elevation: 1 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { fontFamily: 'ExpoArabic-Book', fontSize: 14 },
  infoValue: { fontFamily: 'Urbanist', fontSize: 14, fontWeight: '600' },
  settingLabel: { fontFamily: 'ExpoArabic-Book', fontSize: 14, marginBottom: 8 },
  toggleRow: { flexDirection: 'row', gap: 12 },
  toggleBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
  },
  toggleBtnText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 14 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 13 },
  userCard: {
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    elevation: 1,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  userNameText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 15 },
  userRoleText: { fontFamily: 'ExpoArabic-Light', fontSize: 12 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    height: 52,
    marginTop: 8,
  },
  logoutText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 20, textAlign: 'center', marginBottom: 20 },
  fieldLabel: { fontFamily: 'ExpoArabic-Book', fontSize: 14, marginBottom: 6 },
  modalInput: {
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 16,
    fontFamily: 'ExpoArabic-Book',
    marginBottom: 16,
    borderWidth: 1,
  },
  roleSelector: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  roleBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  roleBtnText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 15 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cancelBtnText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
  saveBtnText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
});
