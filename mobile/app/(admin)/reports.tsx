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
import { getReports, getReportPdf, getReportExcel } from '../../services/api';
import EmptyState from '../../components/EmptyState';
import { APP_CONFIG } from '../../constants/config';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import * as FileSystem from 'expo-file-system/legacy';

export default function AdminReportsScreen() {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const { appName, companyName } = useAppSettings();

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

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString(isRTL ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' });
    } catch { return '-'; }
  };

  const generatePdf = async () => {
    if (!selectedReport) return;
    setPdfLoading(true);
    try {
      const { session, results, summary, not_scanned } = selectedReport;

      const foundRows = results
        .filter((r: any) => r.status === 'found')
        .map((r: any) => `<tr><td>${r.plate_number}</td><td>${r.vehicle_description || '-'}</td><td style="color:#8BC690">${t('foundStatus')}</td><td>${formatTime(r.scanned_at)}</td></tr>`)
        .join('');

      const unknownRows = results
        .filter((r: any) => r.status === 'unknown')
        .map((r: any) => `<tr><td>${r.plate_number}</td><td>-</td><td style="color:#EB8378">${t('unknownStatus')}</td><td>${formatTime(r.scanned_at)}</td></tr>`)
        .join('');

      const notScannedRows = (not_scanned || [])
        .map((v: any) => `<tr><td>${v.plate_number}</td><td>${v.description || '-'}</td><td style="color:#B5C0C6">${t('notScanned')}</td><td>-</td></tr>`)
        .join('');

      const locationText = session.latitude ? `${session.latitude.toFixed(5)}, ${session.longitude.toFixed(5)}` : (t('locationNotAvailable') || 'غير متوفر');

      const dir = isRTL ? 'rtl' : 'ltr';
      const textAlign = isRTL ? 'right' : 'left';
      const html = `
        <html dir="${dir}" lang="${isRTL ? 'ar' : 'en'}">
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; direction: ${dir}; }
            h1 { color: #6EB1BE; text-align: center; border-bottom: 3px solid #6EB1BE; padding-bottom: 10px; }
            h2 { color: #6EB1BE; margin-top: 30px; }
            .info { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }
            .info-item { flex: 1; min-width: 45%; text-align: center; padding: 8px; background: #EFF2F9; border-radius: 8px; }
            .info-label { color: #5A6268; font-size: 11px; }
            .info-value { font-size: 14px; font-weight: bold; color: #171b1d; }
            .summary { display: flex; gap: 15px; margin: 20px 0; }
            .stat { flex: 1; padding: 15px; border-radius: 10px; text-align: center; }
            .stat-found { background: #E8F5EC; color: #8BC690; }
            .stat-danger { background: #FDF0EF; color: #EB8378; }
            .stat-missing { background: #EFF2F9; color: #B5C0C6; }
            .stat-number { font-size: 28px; font-weight: bold; }
            .stat-label { font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #6EB1BE; color: white; padding: 10px; text-align: ${textAlign}; }
            td { padding: 8px 10px; border-bottom: 1px solid #E5EBF1; }
            tr:nth-child(even) { background: #F0F3F6; }
            .footer { text-align: center; color: #B5C0C6; font-size: 11px; margin-top: 40px; border-top: 1px solid #E5EBF1; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>${t('scanReport')} - ${companyName || 'CATCH IT'}</h1>
          <div class="info">
            <div class="info-item"><div class="info-label">${t('date')}</div><div class="info-value">${session.date}</div></div>
            <div class="info-item"><div class="info-label">${t('employee')}</div><div class="info-value">${session.employee_name}</div></div>
            <div class="info-item"><div class="info-label">${t('startTime')}</div><div class="info-value">${formatTime(session.started_at)}</div></div>
            <div class="info-item"><div class="info-label">${t('endTime')}</div><div class="info-value">${formatTime(session.completed_at)}</div></div>
            <div class="info-item"><div class="info-label">${t('scanDuration')}</div><div class="info-value">${session.duration || '-'}</div></div>
            <div class="info-item"><div class="info-label">${t('location')}</div><div class="info-value">${locationText}</div></div>
          </div>
          <div class="summary">
            <div class="stat stat-found"><div class="stat-number">${summary.found}</div><div class="stat-label">${t('found')}</div></div>
            <div class="stat stat-danger"><div class="stat-number">${summary.unknown}</div><div class="stat-label">${t('unknown')}</div></div>
            <div class="stat stat-missing"><div class="stat-number">${(not_scanned || []).length}</div><div class="stat-label">${t('notScanned')}</div></div>
          </div>
          <h2>${t('scanResults')}</h2>
          <table>
            <tr><th>${t('plateNumber')}</th><th>${t('description')}</th><th>${t('status')}</th><th>${t('time')}</th></tr>
            ${foundRows}${unknownRows}${notScannedRows}
          </table>
          <div class="footer">${appName || 'CATCH IT'} - ${new Date().toLocaleString(isRTL ? 'ar' : 'en')}</div>
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

  const generateExcel = async () => {
    if (!selectedReport) return;
    setExcelLoading(true);
    try {
      const data = await getReportExcel(selectedReport.session.id);
      const filePath = `${FileSystem.cacheDirectory}${data.filename}`;
      await FileSystem.writeAsStringAsync(filePath, data.data, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: t('downloadExcel') || 'تحميل Excel',
      });
    } catch (e: any) {
      Alert.alert(t('error'), e.message || t('excelFailed') || 'فشل إنشاء ملف Excel');
    } finally {
      setExcelLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'found') return colors.success;
    return colors.danger;
  };

  const getStatusText = (status: string) => {
    if (status === 'found') return t('foundStatus');
    return t('unknownStatus');
  };

  const renderReport = ({ item }: any) => (
    <TouchableOpacity style={[styles.reportCard, { backgroundColor: colors.card }]} onPress={() => viewReport(item)} activeOpacity={0.7}>
      <View style={styles.reportHeader}>
        <Text style={[styles.reportDate, { color: colors.textDark }]}>
          {item.started_at ? item.started_at.split('T')[0] : '-'}
        </Text>
        <Text style={[styles.reportTime, { color: colors.primary }]}>
          {formatTime(item.started_at)}
        </Text>
      </View>
      <Text style={[styles.reportEmployee, { color: colors.textMedium, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{t('employee')}: {item.employee_name}</Text>
      <View style={styles.reportStats}>
        <View style={[styles.reportStat, { backgroundColor: colors.successLight }]}>
          <Text style={[styles.reportStatNum, { color: colors.success }]}>{item.found_count || 0}</Text>
          <Text style={[styles.reportStatLabel, { color: colors.textMedium }]}>{t('found')}</Text>
        </View>
        <View style={[styles.reportStat, { backgroundColor: colors.dangerLight }]}>
          <Text style={[styles.reportStatNum, { color: colors.danger }]}>{item.unknown_count || 0}</Text>
          <Text style={[styles.reportStatLabel, { color: colors.textMedium }]}>{t('unknown')}</Text>
        </View>
        <View style={[styles.reportStat, { backgroundColor: colors.surface }]}>
          <Text style={[styles.reportStatNum, { color: colors.primary }]}>{item.total_scanned || 0}</Text>
          <Text style={[styles.reportStatLabel, { color: colors.textMedium }]}>{t('total')}</Text>
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
                  <Text style={[styles.infoText, { color: colors.textDark }]}>{t('date')}: {selectedReport.session.date}</Text>
                  <Text style={[styles.infoText, { color: colors.textDark }]}>{t('employee')}: {selectedReport.session.employee_name}</Text>
                  <Text style={[styles.infoText, { color: colors.textDark }]}>{t('startTime')}: {formatTime(selectedReport.session.started_at)}</Text>
                  <Text style={[styles.infoText, { color: colors.textDark }]}>{t('endTime')}: {formatTime(selectedReport.session.completed_at)}</Text>
                  <Text style={[styles.infoText, { color: colors.textDark }]}>{t('scanDuration')}: {selectedReport.session.duration || '-'}</Text>
                  {selectedReport.session.latitude && (
                    <Text style={[styles.infoText, { color: colors.textDark }]}>{t('location')}: {selectedReport.session.latitude.toFixed(5)}, {selectedReport.session.longitude.toFixed(5)}</Text>
                  )}
                </View>

                <ScrollView style={styles.resultsList}>
                  {selectedReport.results.map((r: any) => (
                    <View key={r.id} style={[styles.resultItem, { borderBottomColor: colors.border }]}>
                      <View style={[styles.statusDot, { backgroundColor: getStatusColor(r.status) }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.resultPlate, { color: colors.textDark }]}>{r.plate_number}</Text>
                        <Text style={[styles.resultTime, { color: colors.textLight }]}>{formatTime(r.scanned_at)}</Text>
                      </View>
                      <Text style={[styles.resultStatus, { color: getStatusColor(r.status) }]}>
                        {getStatusText(r.status)}
                      </Text>
                    </View>
                  ))}
                  {selectedReport.not_scanned?.map((v: any, i: number) => (
                    <View key={`ns-${i}`} style={[styles.resultItem, { borderBottomColor: colors.border }]}>
                      <View style={[styles.statusDot, { backgroundColor: colors.textLight }]} />
                      <Text style={[styles.resultPlate, { color: colors.textDark, flex: 1 }]}>{v.plate_number}</Text>
                      <Text style={[styles.resultStatus, { color: colors.textLight }]}>{t('notScanned')}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.pdfButton, { backgroundColor: colors.accent, flex: 1 }, pdfLoading && { opacity: 0.7 }]}
                    onPress={generatePdf}
                    disabled={pdfLoading}
                  >
                    {pdfLoading ? (
                      <ActivityIndicator color={colors.textOnPrimary} />
                    ) : (
                      <>
                        <Ionicons name="document-outline" size={20} color={colors.textOnPrimary} />
                        <Text style={[styles.pdfButtonText, { color: colors.textOnPrimary }]}>PDF</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pdfButton, { backgroundColor: colors.success, flex: 1 }, excelLoading && { opacity: 0.7 }]}
                    onPress={generateExcel}
                    disabled={excelLoading}
                  >
                    {excelLoading ? (
                      <ActivityIndicator color={colors.textOnPrimary} />
                    ) : (
                      <>
                        <Ionicons name="grid-outline" size={20} color={colors.textOnPrimary} />
                        <Text style={[styles.pdfButtonText, { color: colors.textOnPrimary }]}>Excel</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
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
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  reportDate: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
  reportTime: { fontFamily: 'Urbanist', fontSize: 13, fontWeight: '600' },
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
  resultPlate: { fontFamily: 'Urbanist', fontWeight: '700', fontSize: 15 },
  resultTime: { fontFamily: 'ExpoArabic-Light', fontSize: 11 },
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
