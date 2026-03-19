import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, FlatList,
  ActivityIndicator, Vibration, Dimensions, Animated, Modal,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
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
import { startScan, submitPlate, completeScan, getVehicles } from '../../services/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Common words/text to REJECT (not license plates)
const REJECT_WORDS = new Set([
  'EXIT', 'STOP', 'PARK', 'NO', 'ONE', 'WAY', 'ZONE', 'MAX', 'MIN',
  'THE', 'FOR', 'AND', 'NOT', 'ARE', 'WAS', 'HAS', 'HAD', 'BUT',
  'SPEED', 'LIMIT', 'TAXI', 'BUS', 'ROAD', 'AUTO', 'CAR', 'VAN',
  'OPEN', 'CLOSE', 'PUSH', 'PULL', 'FREE', 'SALE', 'NEW', 'OLD',
  'HOTEL', 'SHOP', 'CAFE', 'BANK', 'MALL', 'MART', 'RENT',
  'KSA', 'UAE', 'USA', 'COM', 'NET', 'ORG', 'WWW', 'HTTP',
]);

// Valid Saudi plate Latin letters (only these appear on Saudi plates)
const VALID_SAUDI_LETTERS = new Set([
  'A', 'B', 'D', 'E', 'G', 'H', 'J', 'K', 'L', 'N',
  'R', 'S', 'T', 'U', 'V', 'X', 'Z',
]);

// Strict plate patterns - must have BOTH letters and digits
const PLATE_PATTERNS = [
  /[\u0621-\u064A]{1,3}\s+\d{1,4}/g,
  /\d{1,4}\s+[\u0621-\u064A]{1,3}/g,
  /\b[A-Z]{1,3}[\s\-]+\d{3,4}\b/gi,
  /\b\d{3,4}[\s\-]+[A-Z]{1,3}\b/gi,
  /\b[A-Z]{1,3}\d{3,4}\b/gi,
  /\b\d{3,4}[A-Z]{1,3}\b/gi,
];

// OCR common misreads correction map
const OCR_CORRECTIONS: Record<string, string> = {
  'O': '0', 'I': '1', 'l': '1', 'Q': '0',
  'o': '0', 'i': '1', '|': '1', 'Z': '2',
};

function fixOcrMisreads(text: string): string {
  const parts = text.split(/(\d+)/);
  let fixed = '';
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      fixed += part;
    } else {
      fixed += part;
    }
  }
  fixed = fixed.replace(/(\d)O/g, '$10').replace(/O(\d)/g, '0$1');
  fixed = fixed.replace(/(\d)I/g, '$11').replace(/I(\d)/g, '1$1');
  fixed = fixed.replace(/(\d)l/g, '$11').replace(/l(\d)/g, '1$1');
  return fixed;
}

function isValidSaudiPlate(letters: string): boolean {
  for (const ch of letters.toUpperCase()) {
    if (ch === ' ' || ch === '-') continue;
    if (/[A-Z]/.test(ch) && !VALID_SAUDI_LETTERS.has(ch)) return false;
  }
  return true;
}

function extractPlates(text: string): string[] {
  const plates: Set<string> = new Set();
  const lines = text.split(/\n/);

  for (const line of lines) {
    const cleanLine = fixOcrMisreads(line.trim());
    if (!cleanLine || cleanLine.length < 4) continue;

    for (const pattern of PLATE_PATTERNS) {
      pattern.lastIndex = 0;
      const matches = cleanLine.match(pattern);
      if (matches) {
        for (const m of matches) {
          const cleaned = m.replace(/[\s\-]+/g, ' ').trim().toUpperCase();
          if (cleaned.length < 4 || cleaned.length > 10) continue;
          if (!/\d/.test(cleaned)) continue;
          if (!/[A-Z\u0621-\u064A]/.test(cleaned)) continue;

          const justLetters = cleaned.replace(/[\d\s]/g, '');
          if (REJECT_WORDS.has(justLetters)) continue;

          const digitCount = (cleaned.match(/\d/g) || []).length;
          if (digitCount < 2) continue;

          if (/[A-Z]/.test(justLetters) && !isValidSaudiPlate(justLetters)) continue;

          plates.add(cleaned);
        }
      }
    }
  }
  return Array.from(plates);
}

type PlateCandidate = { plate: string; count: number; firstSeen: number; };
const CONFIDENCE_THRESHOLD = 2;

export default function ScanScreen() {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [torch, setTorch] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [processing, setProcessing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [vehicleCount, setVehicleCount] = useState(0);
  const lastScanTimeRef = useRef(0);
  const cameraRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const sessionIdRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const locationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // Match notification state
  const [matchNotification, setMatchNotification] = useState<{ plate: string; visible: boolean } | null>(null);
  const matchAnim = useRef(new Animated.Value(0)).current;

  // Summary modal state
  const [showSummary, setShowSummary] = useState(false);
  const [scanSummary, setScanSummary] = useState<any>(null);

  useFocusEffect(useCallback(() => {
    loadVehicleCount();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []));

  const loadVehicleCount = async () => {
    try {
      const data = await getVehicles();
      setVehicleCount(Array.isArray(data) ? data.length : 0);
    } catch (e) {}
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
      plateCandidatesRef.current.clear();
      intervalRef.current = setInterval(captureAndProcess, 1500);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  const submittedPlatesRef = useRef<Set<string>>(new Set());
  const plateCandidatesRef = useRef<Map<string, PlateCandidate>>(new Map());

  const captureAndProcess = async () => {
    if (!cameraRef.current || processingRef.current || !sessionIdRef.current) return;

    const now = Date.now();
    if (now - lastScanTimeRef.current < 1200) return;
    lastScanTimeRef.current = now;

    try {
      processingRef.current = true;
      setProcessing(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: true,
        shutterSound: false,
      });

      if (!TextRecognition) {
        console.warn('OCR not available - use manual entry');
        return;
      }

      const allPlates: string[] = [];

      // Pass 1: Full image
      const fullEnhanced = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 2000 } }],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
      );
      const fullResult = await TextRecognition.recognize(fullEnhanced.uri);
      if (fullResult?.text) {
        allPlates.push(...extractPlates(fullResult.text));
      }

      // Pass 2: Cropped center
      const cropEnhanced = await ImageManipulator.manipulateAsync(
        photo.uri,
        [
          { crop: {
            originX: photo.width * 0.1,
            originY: photo.height * 0.3,
            width: photo.width * 0.8,
            height: photo.height * 0.4,
          }},
          { resize: { width: 2000 } },
        ],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
      );
      const cropResult = await TextRecognition.recognize(cropEnhanced.uri);
      if (cropResult?.text) {
        allPlates.push(...extractPlates(cropResult.text));
      }

      const uniquePlates = [...new Set(allPlates)];

      // Confidence tracking
      for (const plate of uniquePlates) {
        if (submittedPlatesRef.current.has(plate)) continue;

        const existing = plateCandidatesRef.current.get(plate);
        if (existing) {
          existing.count++;
          if (existing.count >= CONFIDENCE_THRESHOLD) {
            submittedPlatesRef.current.add(plate);
            plateCandidatesRef.current.delete(plate);
            await submitPlateNumber(plate);
          }
        } else {
          plateCandidatesRef.current.set(plate, {
            plate, count: 1, firstSeen: now,
          });
        }
      }

      // Clean old candidates
      for (const [key, candidate] of plateCandidatesRef.current) {
        if (now - candidate.firstSeen > 10000) {
          plateCandidatesRef.current.delete(key);
        }
      }

    } catch (e) {
      console.warn('[OCR] Frame processing error:', e);
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const [manualPlate, setManualPlate] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const submitPlateNumber = async (plate: string) => {
    if (!sessionId && !sessionIdRef.current || !plate) return;
    try {
      const sid = sessionIdRef.current || sessionId;
      const result = await submitPlate(sid!, plate, locationRef.current || undefined);
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
    if (!sessionId && !sessionIdRef.current) return;
    setCompleting(true);
    try {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const sid = sessionIdRef.current || sessionId;
      const report = await completeScan(sid!);
      setScanning(false);
      setSessionId(null);
      sessionIdRef.current = null;

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
          {vehicleCount > 0
            ? `${vehicleCount} ${t('vehiclesInDatabase')}`
            : t('readyToScan')}
        </Text>
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

  const getStatusStyle = (status: string) => {
    if (status === 'found') return { bg: colors.successLight, color: colors.success, text: t('foundStatus') };
    return { bg: colors.dangerLight, color: colors.danger, text: t('unknownStatus') };
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
            {/* Match Notification Banner */}
            {matchNotification?.visible && (
              <Animated.View style={[
                styles.matchBanner,
                { backgroundColor: colors.success, opacity: matchAnim,
                  transform: [{ translateY: matchAnim.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }]
                }
              ]}>
                <Ionicons name="checkmark-circle" size={28} color="#FFFFFF" />
                <View style={styles.matchTextContainer}>
                  <Text style={styles.matchPlate}>{matchNotification.plate}</Text>
                  <Text style={styles.matchText}>{t('plateFoundInDb')}</Text>
                </View>
              </Animated.View>
            )}

            {/* Top controls */}
            <View style={styles.topControls}>
              <TouchableOpacity
                style={[styles.controlBtn, torch && { backgroundColor: colors.accent }]}
                onPress={() => setTorch(!torch)}
              >
                <Ionicons name={torch ? 'flash' : 'flash-off'} size={22} color="#FFFFFF" />
              </TouchableOpacity>
              {processing && (
                <View style={styles.processingBadge}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.processingText}>{t('scanning')}</Text>
                </View>
              )}
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
  // Match notification banner
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
  matchText: {
    fontFamily: 'ExpoArabic-Light',
    fontSize: 12,
    color: '#FFFFFF',
  },
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
  processingText: { fontFamily: 'ExpoArabic-Light', fontSize: 12, color: '#FFFFFF' },
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
    color: '#FFFFFF',
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
  // Summary Modal
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
  summaryBox: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
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
