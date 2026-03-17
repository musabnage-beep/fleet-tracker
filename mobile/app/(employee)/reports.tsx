import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, RefreshControl, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getReports, getReport } from '../../services/api';
import EmptyState from '../../components/EmptyState';

export default function EmployeeReportsScreen() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);

  const loadReports = async () => {
    try {
      const data = await getReports();
      setReports(data);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadReports(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  const viewReport = async (report: any) => {
    try {
      const data = await getReport(report.id);
      setSelectedReport(data);
      setDetailModal(true);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'found') return colors.success;
    if (status === 'not_in_shift') return colors.warning;
    return colors.danger;
  };

  const getStatusText = (status: string) => {
    if (status === 'found') return t('foundStatus');
    if (status === 'not_in_shift') return t('notInShiftStatus');
    return t('unknownStatus');
  };

  const renderReport = ({ item }: any) => (
    <TouchableOpacity style={[styles.reportCard, { backgroundColor: colors.card }]} onPress={() => viewReport(item)} activeOpacity={0.7}>
      <View style={styles.reportHeader}>
        <Text style={[styles.reportShift, { color: colors.textDark }]}>{item.shift_name}</Text>
        <Text style={[styles.reportDate, { color: colors.primary }]}>{item.date}</Text>
      </View>
      <View style={styles.reportStats}>
        <View style={[styles.stat, { backgroundColor: colors.successLight }]}>
          <Text style={[styles.statNum, { color: colors.success }]}>{item.found_count}</Text>
          <Text style={[styles.statLabel, { color: colors.textMedium }]}>{t('found')}</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.warningLight }]}>
          <Text style={[styles.statNum, { color: colors.warning }]}>{item.not_in_shift_count}</Text>
          <Text style={[styles.statLabel, { color: colors.textMedium }]}>{t('notInShift')}</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.dangerLight }]}>
          <Text style={[styles.statNum, { color: colors.danger }]}>{item.unknown_count}</Text>
          <Text style={[styles.statLabel, { color: colors.textMedium }]}>{t('unknown')}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={reports}
        keyExtractor={item => String(item.id)}
        renderItem={renderReport}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          <EmptyState icon="document-text-outline" title={t('noReports')} subtitle={t('yourReportsAppearHere')} />
        }
      />

      <Modal visible={detailModal} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {selectedReport && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.textDark }]}>{t('scanResults')}</Text>
                  <TouchableOpacity onPress={() => setDetailModal(false)}>
                    <Ionicons name="close" size={24} color={colors.textMedium} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.summaryText, { color: colors.textDark }]}>
                    {t('total')}: {selectedReport.summary.total_scanned} {t('of')} {selectedReport.summary.total_in_shift}
                  </Text>
                </View>

                <ScrollView style={styles.resultsList}>
                  {selectedReport.results.map((r: any) => (
                    <View key={r.id} style={[styles.resultItem, { borderBottomColor: colors.border }]}>
                      <View style={[styles.dot, { backgroundColor: getStatusColor(r.status) }]} />
                      <Text style={[styles.resultPlate, { color: colors.textDark }]}>{r.plate_number}</Text>
                      <Text style={[styles.resultStatus, { color: getStatusColor(r.status) }]}>
                        {getStatusText(r.status)}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16 },
  reportCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reportShift: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
  reportDate: { fontFamily: 'Urbanist', fontSize: 13, fontWeight: '600' },
  reportStats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 8, padding: 8, alignItems: 'center' },
  statNum: { fontFamily: 'Urbanist', fontWeight: '900', fontSize: 20 },
  statLabel: { fontFamily: 'ExpoArabic-Light', fontSize: 10 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 20 },
  summaryCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  summaryText: { fontFamily: 'ExpoArabic-Book', fontSize: 15, textAlign: 'center' },
  resultsList: { maxHeight: 350 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  resultPlate: { fontFamily: 'Urbanist', fontWeight: '700', fontSize: 15, flex: 1 },
  resultStatus: { fontFamily: 'ExpoArabic-Book', fontSize: 12 },
});
