import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getVehicles, getReports } from '../../services/api';

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [vehicleCount, setVehicleCount] = useState(0);
  const [recentScans, setRecentScans] = useState<any[]>([]);

  const today = new Date().toISOString().split('T')[0];

  const loadData = async () => {
    try {
      const [vehicles, reports] = await Promise.all([
        getVehicles(),
        getReports(),
      ]);
      setVehicleCount(Array.isArray(vehicles) ? vehicles.length : 0);
      setRecentScans(Array.isArray(reports) ? reports.slice(0, 3) : []);
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

      {/* Stats */}
      <View style={[styles.statsRow]}>
        <View style={[styles.statBox, { backgroundColor: colors.card }]}>
          <Ionicons name="car" size={28} color={colors.primary} />
          <Text style={[styles.statNum, { color: colors.textDark }]}>{vehicleCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textMedium }]}>{t('vehiclesInDatabase')}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.card }]}>
          <Ionicons name="scan" size={28} color={colors.success} />
          <Text style={[styles.statNum, { color: colors.textDark }]}>{recentScans.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMedium }]}>{t('recentScans')}</Text>
        </View>
      </View>

      {/* Start Scan Button */}
      <TouchableOpacity
        style={[styles.scanButton, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/(employee)/scan')}
        activeOpacity={0.8}
      >
        <Ionicons name="scan" size={28} color={colors.textOnPrimary} />
        <Text style={[styles.scanButtonText, { color: colors.textOnPrimary }]}>{t('startScanning')}</Text>
      </TouchableOpacity>

      {/* Recent Scans */}
      {recentScans.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textDark }]}>{t('recentScans')}</Text>
          {recentScans.map((r: any, idx: number) => (
            <View key={r.id || idx} style={[styles.scanItem, { backgroundColor: colors.card }]}>
              <View style={styles.scanItemLeft}>
                <Ionicons name="document-text" size={20} color={colors.primary} />
                <View>
                  <Text style={[styles.scanDate, { color: colors.textDark }]}>
                    {r.started_at ? r.started_at.split('T')[0] : '-'}
                  </Text>
                  <Text style={[styles.scanStats, { color: colors.textMedium }]}>
                    {r.total_scanned || 0} {t('scannedPlate')} | {r.found_count || 0} {t('foundStatus')}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </>
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    gap: 6,
    elevation: 2,
  },
  statNum: { fontFamily: 'Urbanist', fontWeight: '900', fontSize: 28 },
  statLabel: { fontFamily: 'ExpoArabic-Light', fontSize: 12, textAlign: 'center' },
  scanButton: {
    borderRadius: 16,
    height: 64,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
    elevation: 4,
  },
  scanButtonText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 20 },
  sectionTitle: {
    fontFamily: 'ExpoArabic-SemiBold',
    fontSize: 16,
    marginBottom: 10,
  },
  scanItem: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    elevation: 1,
  },
  scanItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scanDate: { fontFamily: 'Urbanist', fontWeight: '600', fontSize: 14 },
  scanStats: { fontFamily: 'ExpoArabic-Light', fontSize: 12 },
});
