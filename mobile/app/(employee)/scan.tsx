import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, FlatList,
  ActivityIndicator, Vibration, Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getTodayShift, startScan, submitPlate, completeScan } from '../../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Regex patterns for license plates (Arabic, Latin, mixed)
const PLATE_PATTERNS = [
  // Saudi plates: 3 letters + 4 digits or variations
  /[A-Z]{1,3}\s*\d{1,4}/gi,
  // Arabic letters + digits
  /[\u0621-\u064A]{1,3}\s*\d{1,4}/g,
  // General: digits and letters combo (at least 2 chars + 2 digits)
  /\b[A-Z0-9]{2,3}[\s\-]*\d{2,4}\b/gi,
  /\b\d{2,4}[\s\-]*[A-Z0-9]{2,3}\b/gi,
];

function extractPlates(text: string): string[] {
  const plates: Set<string> = new Set();
  const cleanText = text.replace(/\n/g, ' ').trim();

  for (const pattern of PLATE_PATTERNS) {
    const matches = cleanText.match(pattern);
    if (matches) {
      for (const m of matches) {
        const cleaned = m.replace(/[\s\-]/g, ' ').trim().toUpperCase();
        if (cleaned.length >= 4) {
          plates.add(cleaned);
        }
      }
    }
  }
  return Array.from(plates);
}

export default function ScanScreen() {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [shiftId, setShiftId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [torch, setTorch] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [processing, setProcessing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [shiftVehicles, setShiftVehicles] = useState<any[]>([]);
  const [lastScanTime, setLastScanTime] = useState(0);
  const cameraRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  useFocusEffect(useCallback(() => {
    loadShift();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []));

  const loadShift = async () => {
    try {
      const data = await getTodayShift();
      if (data.shift) {
        setShiftId(data.shift.id);
        setShiftVehicles(data.vehicles || []);
      }
    } catch (e) {}
  };

  const handleStartScan = async () => {
    if (!shiftId) {
      Alert.alert(t('alert'), t('noShiftToday'));
      return;
    }
    try {
      const { session_id } = await startScan(shiftId);
      setSessionId(session_id);
      setScanning(true);
      setResults([]);
      // Start auto-scanning
      intervalRef.current = setInterval(captureAndProcess, 2000);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  const captureAndProcess = async () => {
    if (!cameraRef.current || processing) return;

    const now = Date.now();
    if (now - lastScanTime < 1500) return;
    setLastScanTime(now);

    try {
      setProcessing(true);
      // Take photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });

      // Enhance image for better OCR
      const enhanced = await ImageManipulator.manipulateAsync(
        photo.uri,
        [
          { resize: { width: 1200 } },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Since we can't run ML Kit directly in Expo managed workflow,
      // we'll use a simulated OCR approach - in production, you'd use
      // react-native-mlkit-ocr or a custom dev build
      // For now, we provide a manual entry option alongside camera

      // Try to use the Google ML Kit via fetch to our server
      // (In production, this would be on-device ML Kit)

    } catch (e) {
      // Silent fail for individual frames
    } finally {
      setProcessing(false);
    }
  };

  const handleManualEntry = () => {
    Alert.prompt(
      t('manualPlateEntry'),
      t('enterPlateYouSee'),
      async (text) => {
        if (text && text.trim() && sessionId) {
          await submitPlateNumber(text.trim().toUpperCase());
        }
      },
      'plain-text',
      '',
      'default'
    );
  };

  // Manual plate entry with TextInput (cross-platform)
  const [manualPlate, setManualPlate] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const submitPlateNumber = async (plate: string) => {
    if (!sessionId || !plate) return;
    try {
      const result = await submitPlate(sessionId, plate);
      if (!result.duplicate) {
        Vibration.vibrate(result.status === 'found' ? 100 : [0, 100, 50, 100]);
        setResults(prev => [result, ...prev]);
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleCompleteScan = async () => {
    if (!sessionId) return;
    setCompleting(true);
    try {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const report = await completeScan(sessionId);
      setScanning(false);
      setSessionId(null);

      const { summary } = report;
      Alert.alert(
        t('scanCompleted'),
        `${t('foundStatus')}: ${summary.found}\n${t('notInShiftStatus')}: ${summary.not_in_shift}\n${t('unknownStatus')}: ${summary.unknown}\n${t('total')}: ${summary.total_scanned} ${t('of')} ${summary.total_in_shift}`,
        [{ text: t('ok') }]
      );
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setCompleting(false);
    }
  };

  if (!permission) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
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

  if (!scanning) {
    return (
      <View style={[styles.startContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="scan-circle-outline" size={80} color={colors.primary} />
        <Text style={[styles.startTitle, { color: colors.textDark }]}>{t('scanVehiclePlates')}</Text>
        <Text style={[styles.startSub, { color: colors.textMedium }]}>
          {shiftId
            ? `${t('todayShiftContains')} ${shiftVehicles.length} ${t('vehicle')}`
            : t('noShiftToday')}
        </Text>
        <TouchableOpacity
          style={[styles.startBtn, { backgroundColor: colors.primary }, !shiftId && { backgroundColor: colors.textLight }]}
          onPress={handleStartScan}
          disabled={!shiftId}
        >
          <Ionicons name="play" size={24} color={colors.textOnPrimary} />
          <Text style={[styles.startBtnText, { color: colors.textOnPrimary }]}>{t('startScan')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getStatusStyle = (status: string) => {
    if (status === 'found') return { bg: colors.successLight, color: colors.success, text: `${t('foundStatus')}` };
    if (status === 'not_in_shift') return { bg: colors.warningLight, color: colors.warning, text: `${t('notInShiftStatus')}` };
    return { bg: colors.dangerLight, color: colors.danger, text: `${t('unknownStatus')}` };
  };

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
          {/* Overlay */}
          <View style={styles.overlay}>
            {/* Top controls */}
            <View style={styles.topControls}>
              <TouchableOpacity
                style={[styles.controlBtn, torch && { backgroundColor: colors.accent }]}
                onPress={() => setTorch(!torch)}
              >
                <Ionicons name={torch ? 'flash' : 'flash-off'} size={22} color="#ffffff" />
              </TouchableOpacity>
              {processing && (
                <View style={styles.processingBadge}>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.processingText}>{t('scanning')}</Text>
                </View>
              )}
            </View>

            {/* Scan frame */}
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.topRight, { borderColor: colors.accent }]} />
              <View style={[styles.corner, styles.topLeft, { borderColor: colors.accent }]} />
              <View style={[styles.corner, styles.bottomRight, { borderColor: colors.accent }]} />
              <View style={[styles.corner, styles.bottomLeft, { borderColor: colors.accent }]} />
              <Text style={styles.scanHint}>{t('pointCameraAtPlate')}</Text>
            </View>
          </View>
        </CameraView>

        {/* Manual entry button */}
        <View style={[styles.manualEntryBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.manualBtn, { backgroundColor: colors.surface }]}
            onPress={() => setShowManualInput(!showManualInput)}
          >
            <Ionicons name="keypad-outline" size={18} color={colors.primary} />
            <Text style={[styles.manualBtnText, { color: colors.primary }]}>{t('manualEntry')}</Text>
          </TouchableOpacity>

          <Text style={[styles.resultCount, { color: colors.textMedium }]}>{results.length} {t('scannedPlate')}</Text>
        </View>

        {/* Manual Input */}
        {showManualInput && (
          <View style={[styles.manualInputContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={styles.manualInputRow}>
              <TouchableOpacity
                style={[styles.manualSubmitBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (manualPlate.trim()) {
                    submitPlateNumber(manualPlate.trim().toUpperCase());
                    setManualPlate('');
                  }
                }}
              >
                <Ionicons name="send" size={20} color={colors.textOnPrimary} />
              </TouchableOpacity>
              <View style={[styles.manualInputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInputComponent
                  value={manualPlate}
                  onChangeText={setManualPlate}
                  placeholder={t('enterPlateNumber')}
                  onSubmit={() => {
                    if (manualPlate.trim()) {
                      submitPlateNumber(manualPlate.trim().toUpperCase());
                      setManualPlate('');
                    }
                  }}
                  colors={colors}
                  isRTL={isRTL}
                />
              </View>
            </View>
          </View>
        )}
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
                <Text style={[styles.resultPlate, { color: colors.textDark }]}>{item.plate_number}</Text>
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

// Simple TextInput component to avoid import issues
function TextInputComponent({ value, onChangeText, placeholder, onSubmit, colors, isRTL }: any) {
  const { TextInput } = require('react-native');
  return (
    <TextInput
      style={{
        flex: 1,
        fontFamily: 'Urbanist',
        fontSize: 16,
        color: colors.textDark,
        textAlign: isRTL ? 'right' : 'left',
        fontWeight: '700',
        letterSpacing: 1,
      }}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textLight}
      autoCapitalize="characters"
      onSubmitEditing={onSubmit}
      returnKeyType="send"
    />
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
  cameraContainer: { height: '40%' },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
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
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  processingText: { fontFamily: 'ExpoArabic-Light', fontSize: 12, color: '#ffffff' },
  scanFrame: {
    alignSelf: 'center',
    width: SCREEN_WIDTH * 0.7,
    height: 80,
    marginBottom: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
  },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  scanHint: {
    fontFamily: 'ExpoArabic-Light',
    fontSize: 13,
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  manualEntryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  manualBtnText: { fontFamily: 'ExpoArabic-Book', fontSize: 13 },
  resultCount: { fontFamily: 'ExpoArabic-Light', fontSize: 12 },
  manualInputContainer: {
    padding: 12,
    borderBottomWidth: 1,
  },
  manualInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  manualInputWrapper: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    justifyContent: 'center',
    borderWidth: 1,
  },
  manualSubmitBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultsContainer: {
    flex: 1,
  },
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
  resultStatus: { fontFamily: 'ExpoArabic-Book', fontSize: 13 },
  emptyText: {
    fontFamily: 'ExpoArabic-Light',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  bottomBar: {
    padding: 16,
    borderTopWidth: 1,
  },
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
});
