import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Alert, Modal, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getVehicles, createVehicle, updateVehicle, deleteVehicle } from '../../services/api';
import EmptyState from '../../components/EmptyState';

export default function VehiclesScreen() {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [plateNumber, setPlateNumber] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const loadVehicles = async () => {
    try {
      const data = await getVehicles();
      setVehicles(data);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadVehicles(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadVehicles();
    setRefreshing(false);
  };

  const openAddModal = () => {
    setEditingVehicle(null);
    setPlateNumber('');
    setDescription('');
    setModalVisible(true);
  };

  const openEditModal = (vehicle: any) => {
    setEditingVehicle(vehicle);
    setPlateNumber(vehicle.plate_number);
    setDescription(vehicle.description || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!plateNumber.trim()) {
      Alert.alert(t('alert'), t('plateNumberRequired'));
      return;
    }
    setSaving(true);
    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, {
          plate_number: plateNumber.trim(),
          description: description.trim(),
        });
      } else {
        await createVehicle({
          plate_number: plateNumber.trim(),
          description: description.trim(),
        });
      }
      setModalVisible(false);
      await loadVehicles();
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (vehicle: any) => {
    Alert.alert(
      t('confirmDelete'),
      `${t('deleteVehicleConfirm')} ${vehicle.plate_number}?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVehicle(vehicle.id);
              await loadVehicles();
            } catch (e: any) {
              Alert.alert(t('error'), e.message);
            }
          },
        },
      ]
    );
  };

  const filtered = vehicles.filter(v =>
    v.plate_number.includes(search.toUpperCase()) ||
    (v.description && v.description.includes(search))
  );

  const renderVehicle = ({ item }: any) => (
    <View style={[styles.vehicleCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
      <View style={styles.vehicleInfo}>
        <View style={styles.plateContainer}>
          <Ionicons name="car" size={20} color={colors.primary} />
          <Text style={[styles.plateText, { color: colors.textDark }]}>{item.plate_number}</Text>
        </View>
        {item.description ? (
          <Text style={[styles.descText, { color: colors.textMedium }]}>{item.description}</Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionBtn, { backgroundColor: colors.surface }]}>
          <Ionicons name="create-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.actionBtn, { backgroundColor: colors.surface }]}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search & Add */}
      <View style={styles.topBar}>
        <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textLight} />
          <TextInput
            style={[styles.searchInput, { color: colors.textDark, textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={t('searchVehicle')}
            placeholderTextColor={colors.textLight}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={openAddModal}>
          <Ionicons name="add" size={24} color={colors.textOnPrimary} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.countText, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{filtered.length} {t('vehicle')}</Text>

      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        renderItem={renderVehicle}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <EmptyState icon="car-outline" title={t('noVehicles')} subtitle={t('pressToAddVehicle')} />
        }
      />

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.textDark, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>
              {editingVehicle ? t('editVehicle') : t('addVehicle')}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('plateNumber')} *</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textDark, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]}
              value={plateNumber}
              onChangeText={setPlateNumber}
              placeholder={t('plateExample')}
              placeholderTextColor={colors.textLight}
              autoCapitalize="characters"
            />

            <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('descriptionOptional')}</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textDark, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('descriptionExample')}
              placeholderTextColor={colors.textLight}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textMedium }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.textOnPrimary} size="small" />
                ) : (
                  <Text style={[styles.saveBtnText, { color: colors.textOnPrimary }]}>{t('save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 8,
    gap: 12,
    alignItems: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'ExpoArabic-Book',
    fontSize: 14,
    marginHorizontal: 8,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
  },
  countText: {
    fontFamily: 'ExpoArabic-Light',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  vehicleCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
  },
  vehicleInfo: { flex: 1 },
  plateContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plateText: {
    fontSize: 18,
    fontFamily: 'Urbanist',
    fontWeight: '700',
    letterSpacing: 1,
  },
  descText: {
    fontSize: 13,
    fontFamily: 'ExpoArabic-Light',
    marginTop: 4,
    marginRight: 28,
  },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'ExpoArabic-SemiBold',
    textAlign: 'center',
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: 'ExpoArabic-Book',
    marginBottom: 6,
  },
  modalInput: {
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 16,
    fontFamily: 'ExpoArabic-Book',
    marginBottom: 16,
    borderWidth: 1,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  cancelBtnText: {
    fontFamily: 'ExpoArabic-SemiBold',
    fontSize: 16,
  },
  saveBtnText: {
    fontFamily: 'ExpoArabic-SemiBold',
    fontSize: 16,
  },
});
