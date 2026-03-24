import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Alert, Modal, RefreshControl, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getShifts, getShift, createShift, getVehicles, deleteShift, updateShiftVehicles } from '../../services/api';
import EmptyState from '../../components/EmptyState';

export default function ShiftsScreen() {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState<any>(null);
  const [shiftName, setShiftName] = useState('');
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().split('T')[0]);
  const [allVehicles, setAllVehicles] = useState<any[]>([]);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const loadShifts = async () => {
    try {
      const data = await getShifts();
      setShifts(data);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadShifts(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadShifts();
    setRefreshing(false);
  };

  const openAddModal = async () => {
    setShiftName('');
    setShiftDate(new Date().toISOString().split('T')[0]);
    setSelectedVehicleIds(new Set());
    try {
      const vehicles = await getVehicles();
      setAllVehicles(vehicles);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
      return;
    }
    setModalVisible(true);
  };

  const toggleVehicle = (id: number) => {
    setSelectedVehicleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!shiftName.trim()) {
      Alert.alert(t('alert'), t('shiftNameRequired'));
      return;
    }
    if (selectedVehicleIds.size === 0) {
      Alert.alert(t('alert'), t('selectAtLeastOneVehicle'));
      return;
    }
    setSaving(true);
    try {
      await createShift({
        date: shiftDate,
        name: shiftName.trim(),
        vehicle_ids: Array.from(selectedVehicleIds),
      });
      setModalVisible(false);
      await loadShifts();
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const viewShiftDetail = async (shift: any) => {
    try {
      const detail = await getShift(shift.id);
      setSelectedShift(detail);
      setDetailModal(true);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleDeleteShift = (shift: any) => {
    Alert.alert(t('confirmDelete'), `${t('deleteShiftConfirm')} "${shift.name}"?`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          try {
            await deleteShift(shift.id);
            await loadShifts();
          } catch (e: any) {
            Alert.alert(t('error'), e.message);
          }
        },
      },
    ]);
  };

  const renderShift = ({ item }: any) => (
    <TouchableOpacity style={[styles.shiftCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]} onPress={() => viewShiftDetail(item)} activeOpacity={0.7}>
      <View style={styles.shiftHeader}>
        <View style={styles.shiftTitleRow}>
          <Ionicons name="calendar" size={18} color={colors.primary} />
          <Text style={[styles.shiftName, { color: colors.textDark }]}>{item.name}</Text>
        </View>
        <TouchableOpacity onPress={() => handleDeleteShift(item)}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>
      <View style={styles.shiftMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={14} color={colors.textLight} />
          <Text style={[styles.metaText, { color: colors.textMedium }]}>{item.date}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="car-outline" size={14} color={colors.textLight} />
          <Text style={[styles.metaText, { color: colors.textMedium }]}>{item.vehicle_count} {t('vehicle')}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="person-outline" size={14} color={colors.textLight} />
          <Text style={[styles.metaText, { color: colors.textMedium }]}>{item.created_by_name}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary, shadowColor: colors.primary }]} onPress={openAddModal}>
        <Ionicons name="add" size={28} color={colors.textOnPrimary} />
      </TouchableOpacity>

      <FlatList
        data={shifts}
        keyExtractor={item => String(item.id)}
        renderItem={renderShift}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          <EmptyState icon="calendar-outline" title={t('noShifts')} subtitle={t('pressToAddShift')} />
        }
      />

      {/* Create Shift Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.textDark, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('createNewShift')}</Text>

            <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('shiftName')} *</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textDark, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]}
              value={shiftName}
              onChangeText={setShiftName}
              placeholder={t('shiftNameExample')}
              placeholderTextColor={colors.textLight}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('date')} *</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textDark, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]}
              value={shiftDate}
              onChangeText={setShiftDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textLight}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>
              {t('selectVehicles')} ({selectedVehicleIds.size} {t('selected')})
            </Text>
            <ScrollView style={styles.vehicleList}>
              {allVehicles.map(v => (
                <TouchableOpacity
                  key={v.id}
                  style={[
                    styles.vehicleOption,
                    { backgroundColor: colors.surface },
                    selectedVehicleIds.has(v.id) && { backgroundColor: colors.secondaryLight, borderWidth: 1, borderColor: colors.primary },
                  ]}
                  onPress={() => toggleVehicle(v.id)}
                >
                  <Ionicons
                    name={selectedVehicleIds.has(v.id) ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={selectedVehicleIds.has(v.id) ? colors.primary : colors.textLight}
                  />
                  <Text style={[styles.vehicleOptionText, { color: colors.textDark }]}>{v.plate_number}</Text>
                  {v.description ? (
                    <Text style={[styles.vehicleOptionDesc, { color: colors.textMedium }]}>{v.description}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
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
                  <Text style={[styles.saveBtnText, { color: colors.textOnPrimary }]}>{t('create')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={detailModal} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {selectedShift && (
              <>
                <Text style={[styles.modalTitle, { color: colors.textDark }]}>{selectedShift.name}</Text>
                <Text style={[styles.detailDate, { color: colors.primary }]}>{selectedShift.date}</Text>
                <Text style={[styles.fieldLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('vehiclesInShift')}</Text>
                <ScrollView style={styles.vehicleList}>
                  {selectedShift.vehicles?.map((v: any) => (
                    <View key={v.id} style={[styles.detailVehicle, { backgroundColor: colors.surface }]}>
                      <Ionicons name="car" size={18} color={colors.primary} />
                      <Text style={[styles.detailPlate, { color: colors.textDark }]}>{v.plate_number}</Text>
                      {v.description ? <Text style={[styles.detailDesc, { color: colors.textMedium }]}>{v.description}</Text> : null}
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 16 }]}
              onPress={() => setDetailModal(false)}
            >
              <Text style={[styles.cancelBtnText, { color: colors.textMedium }]}>{t('close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 80 },
  shiftCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  shiftTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shiftName: {
    fontSize: 16,
    fontFamily: 'ExpoArabic-SemiBold',
  },
  shiftMeta: { flexDirection: 'row', gap: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: {
    fontSize: 12,
    fontFamily: 'ExpoArabic-Light',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    zIndex: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'ExpoArabic-SemiBold',
    textAlign: 'center',
    marginBottom: 16,
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
  vehicleList: { maxHeight: 200, marginBottom: 16 },
  vehicleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  vehicleOptionText: {
    fontFamily: 'Urbanist',
    fontWeight: '700',
    fontSize: 15,
  },
  vehicleOptionDesc: {
    fontFamily: 'ExpoArabic-Light',
    fontSize: 12,
    flex: 1,
  },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
  saveBtnText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
  detailDate: {
    fontSize: 14,
    fontFamily: 'Urbanist',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  detailVehicle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  detailPlate: {
    fontFamily: 'Urbanist',
    fontWeight: '700',
    fontSize: 15,
  },
  detailDesc: {
    fontFamily: 'ExpoArabic-Light',
    fontSize: 12,
    flex: 1,
  },
});
