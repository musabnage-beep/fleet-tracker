import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, RefreshControl, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getReports, getReportPdf } from '../../services/api';
import EmptyState from '../../components/EmptyState';
import { APP_CONFIG } from '../../constants/config';

export default function AdminReportsScreen() {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

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
      const data = await getReportPdf(report.id);
      setSelectedReport(data);
      setDetailModal(true);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  const generatePdf = async () => {
    if (!selectedReport) return;
    setPdfLoading(true);
    try {
      const { session, results, summary, not_scanned } = selectedReport;

      const foundRows = results
        .filter((r: any) => r.status === 'found')
        .map((r: any) => `<tr><td>${r.plate_number}</td><td>${r.vehicle_description || '-'}</td><td style="color:green">${t('foundStatus')}</td></tr>`)
        .join('');

      const notInShiftRows = results
        .filter((r: any) => r.status === 'not_in_shift')
        .map((r: any) => `<tr><td>${r.plate_number}</td><td>${r.vehicle_description || '-'}</td><td style="color:orange">${t('notInShiftStatus')}</td></tr>`)
        .join('');

      const unknownRows = results
        .filter((r: any) => r.status === 'unknown')
        .map((r: any) => `<tr><td>${r.plate_number}</td><td>-</td><td style="color:red">${t('unknownStatus')}</td></tr>`)
        .join('');

      const notScannedRows = (not_scanned || [])
        .map((v: any) => `<tr><td>${v.plate_number}</td><td>${v.description || '-'}</td><td style="color:gray">${t('notScanned')}</td></tr>`)
        .join('');

      const dir = isRTL ? 'rtl' : 'ltr';
      const textAlign = isRTL ? 'right' : 'left';
      const html = `
        <html dir="${dir}" lang="${isRTL ? 'ar' : 'en'}">
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; direction: ${dir}; }
            h1 { color: #588593; text-align: center; border-bottom: 3px solid #588593; padding-bottom: 10px; }
            h2 { color: #588593; margin-top: 30px; }
            .info { display: flex; justify-content: space-between; margin: 20px 0; }
            .info-item { text-align: center; }
            .info-label { color: #666; font-size: 12px; }
            .info-value { font-size: 18px; font-weight: bold; color: #2f3004; }
            .summary { display: flex; gap: 15px; margin: 20px 0; }
            .stat { flex: 1; padding: 15px; border-radius: 10px; text-align: center; }
            .stat-found { background: #E8F5E9; color: #4CAF50; }
            .stat-warning { background: #FFF3E0; color: #FF9800; }
            .stat-danger { background: #FFEBEE; color: #F44336; }
            .stat-missing { background: #F5F5F5; color: #9E9E9E; }
            .stat-number { font-size: 28px; font-weight: bold; }
            .stat-label { font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #588593; color: white; padding: 10px; text-align: ${textAlign}; }
            td { padding: 8px 10px; border-bottom: 1px solid #eee; }
            tr:nth-child(even) { background: #f8f8f8; }
            .footer { text-align: center; color: #999; font-size: 11px; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>${t('scanReport')} - ${APP_CONFIG.companyName}</h1>
          <div class="info">
            <div class="info-item"><div class="info-label">${t('shift')}</div><div class="info-value">${session.shift_name}</div></div>
            <div class="info-item"><div class="info-label">${t('date')}</div><div class="info-value">${session.date}</div></div>
            <div class="info-item"><div class="info-label">${t('employee')}</div><div class="info-value">${session.employee_name}</div></div>
          </div>
          <div class="summary">
            <div class="stat stat-found"><div class="stat-number">${summary.found}</div><div class="stat-label">${t('found')}</div></div>
            <div class="stat stat-warning"><div class="stat-number">${summary.not_in_shift}</div><div class="stat-label">${t('notInShift')}</div></div>
            <div class="stat stat-danger"><div class="stat-number">${summary.unknown}</div><div class="stat-label">${t('unknown')}</div></div>
            <div class="stat stat-missing"><div class="stat-number">${(not_scanned || []).length}</div><div class="stat-label">${t('notScanned')}</div></div>
          </div>
          <h2>${t('scanResults')}</h2>
          <table>
            <tr><th>${t('plateNumber')}</th><th>${t('description')}</th><th>${t('status')}</th></tr>
            ${foundRows}${notInShiftRows}${unknownRows}${notScannedRows}
          </table>
          <div class="footer">${APP_CONFIG.appName} - ${new Date().toLocaleString(isRTL ? 'ar' : 'en')}</div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: t('scanReport') });
    } catch (e: any) {
      Alert.alert(t('error'), t('pdfFailed'));
    } finally {
      setPdfLoading(false);
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
    <TouchableOpacity style={[styles.reportCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]} onPress={() => viewReport(item)} activeOpacity={0.7}>
      <View style={styles.reportHeader}>
        <Text style={[styles.reportShift, { color: colors.textDark }]}>{item.shift_name}</Text>
        <Text style={[styles.reportDate, { color: colors.primary }]}>{item.date}</Text>
      </View>
      <Text style={[styles.reportEmployee, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('employee')}: {item.employee_name}</Text>
      <View style={styles.reportStats}>
        <View style={[styles.reportStat, { backgroundColor: colors.successLight }]}>
          <Text style={[styles.reportStatNum, { color: colors.success }]}>{item.found_count}</Text>
          <Text style={[styles.reportStatLabel, { color: colors.textMedium }]}>{t('found')}</Text>
        </View>
        <View style={[styles.reportStat, { backgroundColor: colors.warningLight }]}>
          <Text style={[styles.reportStatNum, { color: colors.warning }]}>{item.not_in_shift_count}</Text>
          <Text style={[styles.reportStatLabel, { color: colors.textMedium }]}>{t('notInShift')}</Text>
        </View>
        <View style={[styles.reportStat, { backgroundColor: colors.dangerLight }]}>
          <Text style={[styles.reportStatNum, { color: colors.danger }]}>{item.unknown_count}</Text>
          <Text style={[styles.reportStatLabel, { color: colors.textMedium }]}>{t('unknown')}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
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
          <EmptyState icon="document-text-outline" title={t('noReports')} subtitle={t('reportsAppearAfterScan')} />
        }
      />

      {/* Detail Modal */}
      <Modal visible={detailModal} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {selectedReport && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.textDark }]}>{t('scanReport')}</Text>
                  <TouchableOpacity onPress={() => setDetailModal(false)}>
                    <Ionicons name="close" size={24} color={colors.textMedium} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.reportInfo, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.infoText, { color: colors.textDark, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('shift')}: {selectedReport.session.shift_name}</Text>
                  <Text style={[styles.infoText, { color: colors.textDark, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('date')}: {selectedReport.session.date}</Text>
                  <Text style={[styles.infoText, { color: colors.textDark, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('employee')}: {selectedReport.session.employee_name}</Text>
                </View>

                <ScrollView style={styles.resultsList}>
                  {selectedReport.results.map((r: any) => (
                    <View key={r.id} style={[styles.resultItem, { borderBottomColor: colors.border }]}>
                      <View style={[styles.statusDot, { backgroundColor: getStatusColor(r.status) }]} />
                      <Text style={[styles.resultPlate, { color: colors.textDark }]}>{r.plate_number}</Text>
                      <Text style={[styles.resultStatus, { color: getStatusColor(r.status) }]}>
                        {getStatusText(r.status)}
                      </Text>
                    </View>
                  ))}
                  {selectedReport.not_scanned?.map((v: any, i: number) => (
                    <View key={`ns-${i}`} style={[styles.resultItem, { borderBottomColor: colors.border }]}>
                      <View style={[styles.statusDot, { backgroundColor: colors.textLight }]} />
                      <Text style={[styles.resultPlate, { color: colors.textDark }]}>{v.plate_number}</Text>
                      <Text style={[styles.resultStatus, { color: colors.textLight }]}>{t('notScanned')}</Text>
                    </View>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  style={[styles.pdfButton, { backgroundColor: colors.accent }, pdfLoading && { opacity: 0.7 }]}
                  onPress={generatePdf}
                  disabled={pdfLoading}
                >
                  {pdfLoading ? (
                    <ActivityIndicator color={colors.textOnPrimary} />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={20} color={colors.textOnPrimary} />
                      <Text style={[styles.pdfButtonText, { color: colors.textOnPrimary }]}>{t('downloadPdf')}</Text>
                    </>
                  )}
                </TouchableOpacity>
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
  list: { padding: 16, paddingBottom: 16 },
  reportCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  reportShift: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
  reportDate: { fontFamily: 'Urbanist', fontSize: 13, fontWeight: '600' },
  reportEmployee: { fontFamily: 'ExpoArabic-Light', fontSize: 13, marginBottom: 10 },
  reportStats: { flexDirection: 'row', gap: 8 },
  reportStat: {
    flex: 1,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  reportStatNum: { fontFamily: 'Urbanist', fontWeight: '900', fontSize: 20 },
  reportStatLabel: { fontFamily: 'ExpoArabic-Light', fontSize: 10 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 20 },
  reportInfo: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 4,
  },
  infoText: { fontFamily: 'ExpoArabic-Book', fontSize: 14 },
  resultsList: { maxHeight: 300, marginBottom: 16 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  resultPlate: { fontFamily: 'Urbanist', fontWeight: '700', fontSize: 15, flex: 1 },
  resultStatus: { fontFamily: 'ExpoArabic-Book', fontSize: 12 },
  pdfButton: {
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    elevation: 3,
  },
  pdfButtonText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
});
