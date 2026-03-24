import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, FlatList,
  ActivityIndicator, Vibration, Dimensions, Animated, Modal, TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  startScan, submitPlate, completeScan, recognizePlate,
  getVehicles, getAnprSettings,
} from '../../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ScanScreen() {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();

  // Session / scanning state
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [torch, setTorch] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [processing, setProcessing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [vehicleCount, setVehicleCount] = useState(0);

  // Fix #1e / #1d: ANPR token status + visible debug badge
  const [hasAnprToken, setHasAnprToken] = useState<boolean | null>(null);
  const [scanDebugMsg, setScanDebugMsg] = useState<string>('');

  // Manual plate entry — Fix #2: always visible, no toggle needed
  const [manualPlate, setManualPlate] = useState('');

  // Summary modal
  const [showSummary, setShowSummary] = useState(false);
  const [scanSummary, setScanSummary] = useState<any>(null);

  // Match notification banner
  const [matchNotification, setMatchNotification] = useState<{ plate: string; visible: boolean } | null>(null);
  const matchAnim = useRef(new Animated.Value(0)).current;

  // Refs — keep these stable across renders
  const cameraRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const sessionIdRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const forcedResetTimerRef = useRef<any>(null);
  const locationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastScanTimeRef = useRef(0);
  // Fix #11: submittedPlatesRef declared before any handler that uses it
  const submittedPlatesRef = useRef<Set<string>>(new Set());

  // Fix #11: proper cleanup when navigating away mid-scan
  useFocusEffect(useCallback(() => {
    loadVehicleCount();
    loadAnprStatus();

    return () => {
      // Clear auto-scan interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (forcedResetTimerRef.current) {
        clearTimeout(forcedResetTimerRef.current);
        forcedResetTimerRef.current = null;
      }
      // Reset session so a stale session_id is never reused on re-entry
      sessionIdRef.current = null;
      setSessionId(null);
      setScanning(false);
      setResults([]);
      setProcessing(false);
      processingRef.current = false;
      submittedPlatesRef.current.clear();
      setScanDebugMsg('');
    };
  }, []));

  const loadVehicleCount = async () => {
    try {
      const data = await getVehicles();
      setVehicleCount(Array.isArray(data) ? data.length : 0);
    } catch (e) {}
  };

  // Fix #1e: check whether ANPR token is configured
  const loadAnprStatus = async () => {
    try {
      const data = await getAnprSettings();
      setHasAnprToken(!!data.hasToken);
    } catch (e) {
      setHasAnprToken(false);
    }
  };

  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        locationRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      }
    } catch (e) {}
  };

  const showMatchBanner = (plate: string) => {
    setMatchNotification({ plate, visible: true });
    Animated.sequence([
      Animated.timing(matchAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(matchAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setMatchNotification(null));
  };

  const handleStartScan = async () => {
    try {
      await getLocation();
      const { session_id } = await startScan(locationRef.current || undefined);
      setSessionId(session_id);
      sessionIdRef.current = session_id;
      setScanning(true);
      setResults([]);
      submittedPlatesRef.current.clear();
      setScanDebugMsg('');
      // Start auto-scanning every 3 seconds
      intervalRef.current = setInterval(captureAndRecognize, 3000);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  // Fix #1a/b: captureAndRecognize with forced safety reset and visible debug feedback
  const captureAndRecognize = async () => {
    if (!cameraRef.current || processingRef.current || !sessionIdRef.current) return;

    const now = Date.now();
    if (now - lastScanTimeRef.current < 2500) return;
    lastScanTimeRef.current = now;

    // Fix #1b: forced safety reset timer — if something hangs for >10s, unblock
    if (forcedResetTimerRef.current) clearTimeout(forcedResetTimerRef.current);
    forcedResetTimerRef.current = setTimeout(() => {
      if (processingRef.current) {
        processingRef.current = false;
        setProcessing(false);
        setScanDebugMsg('Reset (timeout)');
      }
    }, 10000);

    try {
      processingRef.current = true;
      setProcessing(true);
      setScanDebugMsg('Capturing...');

      // Fix #1a: SDK 55 CameraView — use type assertion to call takePictureAsync
      const photo = await (cameraRef.current as any).takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
        shutterSound: false,
      });

      setScanDebugMsg('Sending to ANPR...');

      // Fix #1c: read as raw base64 — no data-URI prefix
      const base64 = await FileSystem.readAsStringAsync(photo.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const sid = sessionIdRef.current;
      if (!sid) return;

      const response = await recognizePlate(sid, base64);

      const detected = (response.results || []).length;
      if (detected === 0) {
        setScanDebugMsg('No plate detected');
        return;
      }

      setScanDebugMsg(`Detected ${detected} plate(s)`);

      for (const result of response.results) {
        if (!result.duplicate) {
          const plateKey = result.plate_number;
          if (!submittedPlatesRef.current.has(plateKey)) {
            submittedPlatesRef.current.add(plateKey);
            Vibration.vibrate(result.status === 'found' ? 100 : [0, 100, 50, 100]);
            if (result.status === 'found') showMatchBanner(plateKey);
            setResults(prev => [{ ...result, confidence: result.confidence }, ...prev]);
          }
        }
      }
    } catch (e: any) {
      // Fix #1d: surface actual error message in the debug badge
      const msg = e.message || 'Unknown error';
      console.warn('[ANPR] Scan error:', msg);
      setScanDebugMsg(`Error: ${msg}`);
    } finally {
      if (forcedResetTimerRef.current) clearTimeout(forcedResetTimerRef.current);
      // Fix #1b: always reset processing flag in finally
      processingRef.current = false;
      setProcessing(false);
    }
  };

  // Fix #2: submitPlateNumber — called by manual entry
  const submitPlateNumber = async (plate: string) => {
    const sid = sessionIdRef.current || sessionId;
    if (!sid || !plate) return;
    try {
      const result = await submitPlate(sid, plate, locationRef.current || undefined);
      if (!result.duplicate) {
        if (result.status === 'found') {
          Vibration.vibrate(100);
          showMatchBanner(plate);
        } else {
          Vibration.vibrate([0, 100, 50, 100]);
        }
        setResults(prev => [result, ...prev]);
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleCompleteScan = async () => {
    const sid = sessionIdRef.current || sessionId;
    if (!sid) return;
    setCompleting(true);
    try {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const report = await completeScan(sid);
      setScanning(false);
      setSessionId(null);
      sessionIdRef.current = null;
      submittedPlatesRef.current.clear();

      const { summary, session } = report;
      setScanSummary({
        total: summary.total_scanned,
        found: summary.found,
        unknown: summary.unknown,
        duration: session.duration || '-',
      });
      setShowSummary(true);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setCompleting(false);
    }
  };

  // ─── Permission screen ────────────────────────────────────────────────────
  if (!permission) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="camera-outline" size={64} color={colors.secondary} />
        <Text style={[styles.permissionTitle, { color: colors.textDark }]}>{t('cameraPermissionRequired')}</Text>
        <Text style={[styles.permissionText, { color: colors.textMedium }]}>{t('appNeedsCamera')}</Text>
        <TouchableOpacity style={[styles.permissionBtn, { backgroundColor: colors.primary }]} onPress={requestPermission}>
          <Text style={[styles.permissionBtnText, { color: colors.textOnPrimary }]}>{t('grantPermission')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Start screen (not scanning yet) ─────────────────────────────────────
  if (!scanning) {
    return (
      <View style={[styles.startContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="scan-circle-outline" size={80} color={colors.primary} />
        <Text style={[styles.startTitle, { color: colors.textDark }]}>{t('scanVehiclePlates')}</Text>

        {/* Fix #10: always show vehicle DB count with a clear label */}
        <Text style={[styles.startSub, { color: colors.textMedium }]}>
          {t('vehiclesInDatabase') || 'Vehicles in database'}{': '}{vehicleCount}
        </Text>

        {/* Fix #1e: ANPR token warning on start screen */}
        {hasAnprToken === false && (
          <View style={[styles.warningBanner, { backgroundColor: '#FFF3CD', borderColor: '#FFC107' }]}>
            <Ionicons name="warning-outline" size={18} color="#856404" />
            <Text style={[styles.warningText, { color: '#856404' }]}>
              {t('anprNotConfigured') || 'ANPR token not configured — camera scanning disabled. Set it in Admin → Settings.'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.startBtn, { backgroundColor: colors.primary }]}
          onPress={handleStartScan}
        >
          <Ionicons name="play" size={24} color={colors.textOnPrimary} />
          <Text style={[styles.startBtnText, { color: colors.textOnPrimary }]}>{t('startScan')}</Text>
        </TouchableOpacity>

        {/* Summary Modal */}
        <Modal visible={showSummary} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
              <Ionicons name="checkmark-circle" size={56} color={colors.success} />
              <Text style={[styles.summaryTitle, { color: colors.textDark }]}>{t('scanCompleted')}</Text>

              <View style={styles.summaryRow}>
                <View style={[styles.summaryBox, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.summaryNum, { color: colors.primary }]}>{scanSummary?.total || 0}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.textMedium }]}>{t('totalScanned')}</Text>
                </View>
              </View>

              <View style={styles.summaryRow}>
                <View style={[styles.summaryBox, { backgroundColor: colors.successLight }]}>
                  <Text style={[styles.summaryNum, { color: colors.success }]}>{scanSummary?.found || 0}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.success }]}>{t('foundStatus')}</Text>
                </View>
                <View style={[styles.summaryBox, { backgroundColor: colors.dangerLight }]}>
                  <Text style={[styles.summaryNum, { color: colors.danger }]}>{scanSummary?.unknown || 0}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.danger }]}>{t('unknownStatus')}</Text>
                </View>
              </View>

              <View style={[styles.summaryDuration, { backgroundColor: colors.surface }]}>
                <Ionicons name="time-outline" size={18} color={colors.textMedium} />
                <Text style={[styles.summaryDurationText, { color: colors.textMedium }]}>{scanSummary?.duration}</Text>
              </View>

              <TouchableOpacity
                style={[styles.summaryBtn, { backgroundColor: colors.primary }]}
                onPress={() => setShowSummary(false)}
              >
                <Text style={[styles.summaryBtnText, { color: colors.textOnPrimary }]}>{t('ok')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ─── Status style helper ──────────────────────────────────────────────────
  const getStatusStyle = (status: string) => {
    if (status === 'found') return { bg: colors.successLight, color: colors.success, text: t('foundStatus') };
    return { bg: colors.dangerLight, color: colors.danger, text: t('unknownStatus') };
  };

  // ─── Active scanning screen ───────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Camera */}
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          enableTorch={torch}
        >
          <View style={styles.overlay}>
            {/* Match Notification Banner */}
            {matchNotification?.visible && (
              <Animated.View style={[
                styles.matchBanner,
                {
                  backgroundColor: colors.success,
                  opacity: matchAnim,
                  transform: [{ translateY: matchAnim.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }],
                },
              ]}>
                <Ionicons name="checkmark-circle" size={28} color="#FFFFFF" />
                <View style={styles.matchTextContainer}>
                  <Text style={styles.matchPlate}>{matchNotification.plate}</Text>
                  <Text style={styles.matchText}>{t('plateFoundInDb')}</Text>
                </View>
              </Animated.View>
            )}

            {/* Fix #1e: ANPR token warning inside camera view */}
            {hasAnprToken === false && (
              <View style={styles.anprWarningOverlay}>
                <Ionicons name="warning" size={16} color="#856404" />
                <Text style={styles.anprWarningText}>
                  {t('anprNotConfigured') || 'ANPR token not set — go to Admin → Settings'}
                </Text>
              </View>
            )}

            {/* Top controls */}
            <View style={styles.topControls}>
              <TouchableOpacity
                style={[styles.controlBtn, torch && { backgroundColor: colors.accent }]}
                onPress={() => setTorch(!torch)}
              >
                <Ionicons name={torch ? 'flash' : 'flash-off'} size={22} color="#FFFFFF" />
              </TouchableOpacity>

              {/* Fix #1d: always-visible scan status badge */}
              <View style={[styles.processingBadge, { backgroundColor: processing ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)' }]}>
                {processing && <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 4 }} />}
                <Text style={styles.processingText} numberOfLines={1}>
                  {processing ? (t('scanning') || 'Scanning…') : (scanDebugMsg || (t('autoScanActive') || 'Auto-scan active'))}
                </Text>
              </View>
            </View>

            {/* Scan frame */}
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.topRight, { borderColor: colors.success }]} />
              <View style={[styles.corner, styles.topLeft, { borderColor: colors.success }]} />
              <View style={[styles.corner, styles.bottomRight, { borderColor: colors.success }]} />
              <View style={[styles.corner, styles.bottomLeft, { borderColor: colors.success }]} />
              <Text style={styles.scanHint}>{t('pointCameraAtPlate')}</Text>
            </View>
          </View>
        </CameraView>

        {/* Fix #2: Manual entry — always visible, clearly labelled, large input */}
        <View style={[styles.manualEntryBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.manualEntryLabel, { color: colors.textMedium }]}>
            {t('manualEntry') || 'Manual plate entry'}
          </Text>
          <Text style={[styles.resultCount, { color: colors.textMedium }]}>{results.length} {t('scannedPlate')}</Text>
        </View>

        <View style={[styles.manualInputContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.manualInputRow}>
            <View style={[styles.manualInputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.manualTextInput, { color: colors.textDark }]}
                value={manualPlate}
                onChangeText={text => setManualPlate(text.toUpperCase())}
                placeholder={t('enterPlateNumber') || 'e.g. 1527 RSB'}
                placeholderTextColor={colors.textLight}
                autoCapitalize="characters"
                onSubmitEditing={() => {
                  if (manualPlate.trim()) {
                    submitPlateNumber(manualPlate.trim());
                    setManualPlate('');
                  }
                }}
                returnKeyType="send"
              />
            </View>
            {/* Fix #2: prominent submit button labelled "Submit" */}
            <TouchableOpacity
              style={[styles.manualSubmitBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                if (manualPlate.trim()) {
                  submitPlateNumber(manualPlate.trim());
                  setManualPlate('');
                }
              }}
            >
              <Ionicons name="send" size={18} color={colors.textOnPrimary} />
              <Text style={[styles.manualSubmitBtnText, { color: colors.textOnPrimary }]}>
                {t('submit') || 'Submit'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Results List */}
      <View style={[styles.resultsContainer, { backgroundColor: colors.background }]}>
        <FlatList
          data={results}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          renderItem={({ item }) => {
            const s = getStatusStyle(item.status);
            return (
              <View style={[styles.resultItem, { backgroundColor: s.bg }]}>
                <View>
                  <Text style={[styles.resultPlate, { color: colors.textDark }]}>{item.plate_number}</Text>
                  {item.confidence !== undefined && (
                    <Text style={[styles.confidenceText, { color: colors.textMedium }]}>
                      {Math.round(item.confidence * 100)}%
                    </Text>
                  )}
                </View>
                <Text style={[styles.resultStatus, { color: s.color }]}>{s.text}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textLight }]}>{t('noPlatesScannedYet')}</Text>
          }
        />
      </View>

      {/* Bottom Controls */}
      <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.completeBtn, { backgroundColor: colors.success }, completing && { opacity: 0.7 }]}
          onPress={handleCompleteScan}
          disabled={completing}
        >
          {completing ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={22} color={colors.textOnPrimary} />
              <Text style={[styles.completeBtnText, { color: colors.textOnPrimary }]}>{t('completeScanSubmit')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionTitle: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 20, marginTop: 16 },
  permissionText: { fontFamily: 'ExpoArabic-Light', fontSize: 14, marginTop: 8, textAlign: 'center' },
  permissionBtn: {
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 24,
  },
  permissionBtnText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
  startContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  startTitle: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 22, marginTop: 16 },
  startSub: { fontFamily: 'ExpoArabic-Light', fontSize: 14, marginTop: 8 },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    width: '100%',
  },
  warningText: {
    flex: 1,
    fontFamily: 'ExpoArabic-Book',
    fontSize: 13,
    lineHeight: 18,
  },
  startBtn: {
    borderRadius: 16,
    paddingHorizontal: 40,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 32,
    elevation: 4,
  },
  startBtnText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 18 },
  cameraContainer: { height: '45%' },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between' },
  matchBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingTop: 8,
    gap: 12,
  },
  matchTextContainer: { flex: 1 },
  matchPlate: {
    fontFamily: 'Urbanist',
    fontWeight: '900',
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  matchText: { fontFamily: 'ExpoArabic-Light', fontSize: 12, color: '#FFFFFF' },
  anprWarningOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,243,205,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    margin: 8,
    borderRadius: 8,
    alignSelf: 'stretch',
  },
  anprWarningText: {
    flex: 1,
    fontFamily: 'ExpoArabic-Book',
    fontSize: 12,
    color: '#856404',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingTop: 8,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    maxWidth: SCREEN_WIDTH * 0.55,
  },
  processingText: { fontFamily: 'ExpoArabic-Light', fontSize: 12, color: '#FFFFFF' },
  scanFrame: {
    alignSelf: 'center',
    width: SCREEN_WIDTH * 0.7,
    height: 80,
    marginBottom: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: { position: 'absolute', width: 24, height: 24 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  scanHint: {
    fontFamily: 'ExpoArabic-Light',
    fontSize: 13,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  manualEntryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  manualEntryLabel: {
    fontFamily: 'ExpoArabic-SemiBold',
    fontSize: 13,
  },
  resultCount: { fontFamily: 'ExpoArabic-Light', fontSize: 12 },
  manualInputContainer: {
    padding: 10,
    borderBottomWidth: 1,
  },
  manualInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  manualInputWrapper: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    justifyContent: 'center',
    borderWidth: 1,
  },
  manualTextInput: {
    flex: 1,
    fontFamily: 'Urbanist',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
  manualSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
  },
  manualSubmitBtnText: {
    fontFamily: 'ExpoArabic-SemiBold',
    fontSize: 14,
  },
  resultsContainer: { flex: 1 },
  resultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 10,
  },
  resultPlate: {
    fontFamily: 'Urbanist',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 1,
  },
  confidenceText: { fontFamily: 'ExpoArabic-Light', fontSize: 11, marginTop: 2 },
  resultStatus: { fontFamily: 'ExpoArabic-Book', fontSize: 13 },
  emptyText: {
    fontFamily: 'ExpoArabic-Light',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  bottomBar: { padding: 16, borderTopWidth: 1 },
  completeBtn: {
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    elevation: 3,
  },
  completeBtnText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  summaryCard: {
    width: '100%',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 16,
    elevation: 8,
  },
  summaryTitle: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 22 },
  summaryRow: { flexDirection: 'row', gap: 12, width: '100%' },
  summaryBox: { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center' },
  summaryNum: { fontFamily: 'Urbanist', fontWeight: '900', fontSize: 32 },
  summaryLabel: { fontFamily: 'ExpoArabic-Light', fontSize: 13, marginTop: 4 },
  summaryDuration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  summaryDurationText: { fontFamily: 'ExpoArabic-Book', fontSize: 14 },
  summaryBtn: {
    width: '100%',
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  summaryBtnText: { fontFamily: 'ExpoArabic-SemiBold', fontSize: 16 },
});
