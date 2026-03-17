import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getShifts, getReports, getVehicles } from '../../services/api';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalVehicles: 0,
    todayShifts: 0,
    todayScans: 0,
    todayFound: 0,
    todayMissing: 0,
    todayUnknown: 0,
  });

  const today = new Date().toISOString().split('T')[0];

  const loadData = async () => {
    try {
      const [vehicles, shifts, reports] = await Promise.all([
        getVehicles(),
        getShifts(today),
        getReports(today),
      ]);

      let totalFound = 0, totalMissing = 0, totalUnknown = 0;
      for (const r of reports) {
        totalFound += r.found_count || 0;
        totalMissing += r.not_in_shift_count || 0;
        totalUnknown += r.unknown_count || 0;
      }

      setStats({
        totalVehicles: vehicles.length,
        todayShifts: shifts.length,
        todayScans: reports.length,
        todayFound: totalFound,
        todayMissing: totalMissing,
        todayUnknown: totalUnknown,
      });
    } catch (e) {
      console.log('Dashboard load error:', e);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const StatCard = ({ icon, label, value, color, bgColor }: any) => (
    <View style={[styles.statCard, { borderLeftColor: color, backgroundColor: colors.card, shadowColor: colors.shadow }]}>
      <View style={[styles.statIconBg, { backgroundColor: bgColor }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.textDark }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{label}</Text>
    </View>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      {/* Welcome */}
      <View style={[styles.welcomeCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
        <View>
          <Text style={[styles.welcomeText, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('welcome')}</Text>
          <Text style={[styles.userName, { color: colors.textDark }]}>{user?.name}</Text>
        </View>
        <View style={[styles.dateContainer, { backgroundColor: colors.surface }]}>
          <Ionicons name="calendar" size={16} color={colors.primary} />
          <Text style={[styles.dateText, { color: colors.primary }]}>{today}</Text>
        </View>
      </View>

      {/* Stats Grid */}
      <Text style={[styles.sectionTitle, { color: colors.textDark, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('todayStats')}</Text>
      <View style={styles.statsGrid}>
        <StatCard
          icon="car"
          label={t('totalVehicles')}
          value={stats.totalVehicles}
          color={colors.primary}
          bgColor={colors.surface}
        />
        <StatCard
          icon="list"
          label={t('shifts')}
          value={stats.todayShifts}
          color={colors.primaryLight}
          bgColor={colors.surface}
        />
        <StatCard
          icon="checkmark-circle"
          label={t('found')}
          value={stats.todayFound}
          color={colors.success}
          bgColor={colors.successLight}
        />
        <StatCard
          icon="alert-circle"
          label={t('notInShift')}
          value={stats.todayMissing}
          color={colors.warning}
          bgColor={colors.warningLight}
        />
        <StatCard
          icon="help-circle"
          label={t('unknown')}
          value={stats.todayUnknown}
          color={colors.danger}
          bgColor={colors.dangerLight}
        />
        <StatCard
          icon="scan"
          label={t('scans')}
          value={stats.todayScans}
          color={colors.accent}
          bgColor={colors.accentLight}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 32 },
  welcomeCard: {
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  welcomeText: {
    fontSize: 14,
    fontFamily: 'ExpoArabic-Light',
  },
  userName: {
    fontSize: 22,
    fontFamily: 'ExpoArabic-SemiBold',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dateText: {
    fontSize: 13,
    fontFamily: 'Urbanist',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'ExpoArabic-SemiBold',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    borderRadius: 14,
    padding: 16,
    width: '47%',
    borderLeftWidth: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  statIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontSize: 28,
    fontFamily: 'Urbanist',
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'ExpoArabic-Light',
    marginTop: 2,
  },
});
