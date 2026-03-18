import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, FlatList,
  ActivityIndicator, Vibration, Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
let TextRecognition: any = null;
let TextRecognitionScript: any = {};
try {
  const mlkit = require('@react-native-ml-kit/text-recognition');
  TextRecognition = mlkit.default;
  TextRecognitionScript = mlkit.TextRecognitionScript || {};
} catch (e) {
  console.warn('ML Kit Text Recognition not available');
}
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getTodayShift, startScan, submitPlate, completeScan } from '../../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Common words/text to REJECT (not license plates)
const REJECT_WORDS = new Set([
  'EXIT', 'STOP', 'PARK', 'NO', 'ONE', 'WAY', 'ZONE', 'MAX', 'MIN',
  'THE', 'FOR', 'AND', 'NOT', 'ARE', 'WAS', 'HAS', 'HAD', 'BUT',
  'SPEED', 'LIMIT', 'TAXI', 'BUS', 'ROAD', 'AUTO', 'CAR', 'VAN',
  'OPEN', 'CLOSE', 'PUSH', 'PULL', 'FREE', 'SALE', 'NEW', 'OLD',
  'HOTEL', 'SHOP', 'CAFE', 'BANK', 'MALL', 'MART', 'RENT',
  'KSA', 'UAE', 'USA', 'COM', 'NET', 'ORG', 'WWW', 'HTTP',
]);

// Strict plate patterns - must have BOTH letters and digits
const PLATE_PATTERNS = [
  // Saudi format: 1-3 Arabic letters + space + 1-4 digits
  /[\u0621-\u064A]{1,3}\s+\d{1,4}/g,
  // Saudi format: 1-4 digits + space + 1-3 Arabic letters
  /\d{1,4}\s+[\u0621-\u064A]{1,3}/g,
  // Latin format: 1-3 letters + space/dash + 3-4 digits
  /\b[A-Z]{1,3}[\s\-]+\d{3,4}\b/gi,
  // Latin format: 3-4 digits + space/dash + 1-3 letters
  /\b\d{3,4}[\s\-]+[A-Z]{1,3}\b/gi,
  // Compact: letters immediately followed by digits (e.g. ABC1234)
  /\b[A-Z]{1,3}\d{3,4}\b/gi,
  // Compact: digits immediately followed by letters
  /\b\d{3,4}[A-Z]{1,3}\b/gi,
];

function extractPlates(text: string): string[] {
  const plates: Set<string> = new Set();
  // Process each line separately to avoid cross-line matches
  const lines = text.split(/\n/);

  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine || cleanLine.length < 4) continue;

    for (const pattern of PLATE_PATTERNS) {
      // Reset regex lastIndex
      pattern.lastIndex = 0;
      const matches = cleanLine.match(pattern);
      if (matches) {
        for (const m of matches) {
          const cleaned = m.replace(/[\s\-]+/g, ' ').trim().toUpperCase();

          // Must be 4-10 chars (typical plate length)
          if (cleaned.length < 4 || cleaned.length > 10) continue;

          // Must contain at least one digit
          if (!/\d/.test(cleaned)) continue;

          // Must contain at least one letter (Arabic or Latin)
          if (!/[A-Z\u0621-\u064A]/.test(cleaned)) continue;

          // Reject common words
          const justLetters = cleaned.replace(/[\d\s]/g, '');
          if (REJECT_WORDS.has(justLetters)) continue;

          // Must have at least 2 digits
          const digitCount = (cleaned.match(/\d/g) || []).length;
          if (digitCount < 2) continue;

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
  const lastScanTimeRef = useRef(0);
  const cameraRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  // Use refs so setInterval callback always reads the latest values
  const sessionIdRef = useRef<number | null>(null);
  const processingRef = useRef(false);

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
      sessionIdRef.current = session_id;
      setScanning(true);
      setResults([]);
      submittedPlatesRef.current.clear();
      // Start auto-scanning
      intervalRef.current = setInterval(captureAndProcess, 2000);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  // Track already-submitted plates to avoid duplicate OCR submissions
  const submittedPlatesRef = useRef<Set<string>>(new Set());

  const captureAndProcess = async () => {
    // Use refs instead of state to avoid stale closure in setInterval
    if (!cameraRef.current || processingRef.current || !sessionIdRef.current) return;

    // Throttle: skip if last scan was less than 1.5s ago
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1500) return;
    lastScanTimeRef.current = now;

    try {
      processingRef.current = true;
      setProcessing(true);
      // Take photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });

      // Enhance image for better OCR - higher resolution for plates
      const enhanced = await ImageManipulator.manipulateAsync(
        photo.uri,
        [
          { resize: { width: 1600 } },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Run ML Kit text recognition on the image
      if (!TextRecognition) {
        console.warn('OCR not available - use manual entry');
        return;
      }

      // Try LATIN recognition (picks up digits + Latin letters)
      const ocrResult = await TextRecognition.recognize(enhanced.uri);

      if (ocrResult && ocrResult.text) {
        let fullText = ocrResult.text;
        console.log('[OCR] Detected text:', fullText);

        // Extract plates from OCR text
        const detectedPlates = extractPlates(fullText);
        console.log('[OCR] Extracted plates:', detectedPlates);

        // Submit each new plate
        for (const plate of detectedPlates) {
          if (!submittedPlatesRef.current.has(plate)) {
            submittedPlatesRef.current.add(plate);
            await submitPlateNumber(plate);
          }
        }
      }

    } catch (e) {
      console.warn('[OCR] Frame processing error:', e);
    } finally {
      processingRef.current = false;
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
      const report = await completeScan(sessionIdRef.current || sessionId);
      setScanning(false);
      setSessionId(null);
      sessionIdRef.current = null;

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
