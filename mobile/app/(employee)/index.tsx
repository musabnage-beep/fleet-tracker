import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getTodayShift } from '../../services/api';

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [todayShift, setTodayShift] = useState<any>(null);
  const [todayVehicles, setTodayVehicles] = useState<any[]>([]);

  const today = new Date().toISOString().split('T')[0];

  const loadData = async () => {
    try {
      const data = await getTodayShift();
      setTodayShift(data.shift);
      setTodayVehicles(data.vehicles || []);
    } catch (e) {}
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      {/* Welcome */}
      <View style={[styles.welcomeCard, { backgroundColor: colors.card }]}>
        <View>
          <Text style={[styles.welcomeText, { color: colors.textMedium }]}>{t('welcome')}</Text>
          <Text style={[styles.userName, { color: colors.textDark }]}>{user?.name}</Text>
        </View>
        <View style={[styles.dateTag, { backgroundColor: colors.surface }]}>
          <Ionicons name="calendar" size={14} color={colors.primary} />
          <Text style={[styles.dateText, { color: colors.primary }]}>{today}</Text>
        </View>
      </View>

      {/* Today's Shift */}
      {todayShift ? (
        <>
          <View style={[styles.shiftCard, { backgroundColor: colors.card, borderRightColor: colors.primary }]}>
            <View style={styles.shiftHeader}>
              <Ionicons name="list-circle" size={24} color={colors.primary} />
              <Text style={[styles.shiftName, { color: colors.textDark }]}>{todayShift.name}</Text>
            </View>
            <View style={styles.shiftStat}>
              <Ionicons name="car" size={18} color={colors.textMedium} />
              <Text style={[styles.shiftStatText, { color: colors.textMedium }]}>{todayVehicles.length} {t('vehicleRequired')}</Text>
            </View>
          </View>

          {/* Vehicle List */}
          <Text style={[styles.sectionTitle, { color: colors.textDark }]}>{t('shiftVehicles')}</Text>
          {todayVehicles.map((v: any) => (
            <View key={v.id} style={[styles.vehicleItem, { backgroundColor: colors.card }]}>
              <Ionicons name="car" size={18} color={colors.primary} />
              <Text style={[styles.vehiclePlate, { color: colors.textDark }]}>{v.plate_number}</Text>
              {v.description ? <Text style={[styles.vehicleDesc, { color: colors.textMedium }]}>{v.description}</Text> : null}
            </View>
          ))}

          {/* Start Scan Button */}
          <TouchableOpacity
            style={[styles.scanButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
            onPress={() => router.push('/(employee)/scan')}
            activeOpacity={0.8}
          >
            <Ionicons name="scan" size={24} color={colors.textOnPrimary} />
            <Text style={[styles.scanButtonText, { color: colors.textOnPrimary }]}>{t('startScanning')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.noShift}>
          <Ionicons name="calendar-clear-outline" size={64} color={colors.secondary} />
          <Text style={[styles.noShiftTitle, { color: colors.textMedium }]}>{t('noShiftToday')}</Text>
          <Text style={[styles.noShiftSub, { color: colors.textLight }]}>{t('contactManagerForShift')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  welcomeCard: {
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    elevation: 2,
  },
  welcomeText: { fontFamily: 'ExpoArabic-Light', fontSize: 14 },
  userName: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 22 },
  dateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dateText: { fontFamily: 'Urbanist', fontSize: 13, fontWeight: '600' },
  shiftCard: {
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    borderRightWidth: 4,
    elevation: 2,
  },
  shiftHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  shiftName: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 18 },
  shiftStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shiftStatText: { fontFamily: 'ExpoArabic-Book', fontSize: 14 },
  sectionTitle: {
    fontFamily: 'ExpoArabic-SemiBold',
    fontSize: 16,
    marginBottom: 10,
  },
  vehicleItem: {
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    elevation: 1,
  },
  vehiclePlate: { fontFamily: 'Urbanist', fontWeight: '700', fontSize: 16 },
  vehicleDesc: { fontFamily: 'ExpoArabic-Light', fontSize: 12, flex: 1 },
  scanButton: {
    borderRadius: 16,
    height: 60,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  scanButtonText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 18 },
  noShift: {
    alignItems: 'center',
    padding: 40,
    marginTop: 40,
  },
  noShiftTitle: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 18, marginTop: 16 },
  noShiftSub: { fontFamily: 'ExpoArabic-Light', fontSize: 14, marginTop: 6, textAlign: 'center' },
});
