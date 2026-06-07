import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Dimensions, Platform, Vibration,
} from 'react-native';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';

// react-native-maps only works on native — stub it on web
let MapView, Polyline, Marker;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Polyline = Maps.Polyline;
  Marker = Maps.Marker;
} else {
  const WebMap = ({ style, children }) => (
    <View style={[style, { backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: '#94a3b8', fontSize: 14, fontWeight: '600' }}>🗺️ מפה זמינה באפליקציה הנייד</Text>
      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>GPS פעיל ברקע</Text>
    </View>
  );
  MapView = WebMap;
  Polyline = () => null;
  Marker = () => null;
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import {
  calcDistance, formatTime, formatPace, calcCalories, calcPaceGap,
} from '../utils/runUtils';
import { saveRun } from '../storage/runStorage';

const { width } = Dimensions.get('window');
const PHASE = { SETUP: 'setup', ACTIVE: 'active', PAUSED: 'paused', DONE: 'done' };

export default function RunScreen({ navigation }) {
  useKeepAwake();
  const insets = useSafeAreaInsets();

  // Phase
  const [phase, setPhase] = useState(PHASE.SETUP);
  const [runType, setRunType] = useState('free'); // free | distance | time | test2k | test3k | intervals
  const [withLoad, setWithLoad] = useState(false);

  // Target (Pace Coach)
  const [targetDistance, setTargetDistance] = useState(3);
  const [targetMinutes, setTargetMinutes] = useState(14);

  // Live run data
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [coords, setCoords] = useState([]);
  const [currentCoord, setCurrentCoord] = useState(null);
  const [calories, setCalories] = useState(0);
  const [currentPace, setCurrentPace] = useState(0);
  const [avgPace, setAvgPace] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(0);

  // Pace coach
  const [paceGap, setPaceGap] = useState(null);

  // Refs
  const timerRef = useRef(null);
  const locationRef = useRef(null);
  const elapsedRef = useRef(0);
  const distanceRef = useRef(0);
  const coordsRef = useRef([]);
  const lastKmRef = useRef(0);
  const mapRef = useRef(null);

  // ─── SETUP ──────────────────────────────────────────────────────────────────

  const requestPerms = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('שגיאה', 'יש לאשר גישה למיקום כדי לעקוב אחרי הריצה');
      return false;
    }
    return true;
  };

  // ─── START RUN ───────────────────────────────────────────────────────────────

  const startRun = async () => {
    const ok = await requestPerms();
    if (!ok) return;

    // Reset state
    elapsedRef.current = 0;
    distanceRef.current = 0;
    coordsRef.current = [];
    lastKmRef.current = 0;
    setElapsed(0);
    setDistance(0);
    setCoords([]);
    setCalories(0);
    setCurrentPace(0);
    setAvgPace(0);
    setSpeedKmh(0);
    setPaceGap(null);

    setPhase(PHASE.ACTIVE);
    Speech.speak('ריצה התחילה. בהצלחה!', { language: 'he-IL', rate: 1.1 });

    // Timer
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);

      // Pace Coach update every 10s
      if (runType === 'pace' && elapsedRef.current % 10 === 0) {
        const gap = calcPaceGap(
          elapsedRef.current,
          distanceRef.current,
          targetMinutes * 60,
          targetDistance,
        );
        setPaceGap(gap);
      }
    }, 1000);

    // GPS
    locationRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 5,
      },
      (loc) => {
        const { latitude, longitude, speed } = loc.coords;
        const newCoord = { latitude, longitude };
        setCurrentCoord(newCoord);

        // Center map
        mapRef.current?.animateToRegion({
          latitude,
          longitude,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        }, 500);

        if (coordsRef.current.length > 0) {
          const prev = coordsRef.current[coordsRef.current.length - 1];
          const delta = calcDistance(prev.latitude, prev.longitude, latitude, longitude);
          if (delta > 0.003 && delta < 0.5) { // filter noise
            distanceRef.current += delta;
            setDistance(distanceRef.current);
            setCalories(calcCalories(distanceRef.current));

            // Pace
            if (speed && speed > 0) {
              const kmh = speed * 3.6;
              setSpeedKmh(kmh);
              setCurrentPace(60 / kmh);
            }
            if (elapsedRef.current > 0 && distanceRef.current > 0) {
              setAvgPace(elapsedRef.current / 60 / distanceRef.current);
            }

            // Km milestone voice
            const km = Math.floor(distanceRef.current);
            if (km > lastKmRef.current) {
              lastKmRef.current = km;
              const pace = formatPace(elapsedRef.current / 60 / distanceRef.current);
              Speech.speak(
                `ק"מ ${km}. קצב ${pace} לק"מ. זמן ${formatTime(elapsedRef.current)}.`,
                { language: 'he-IL', rate: 1.1 },
              );
              if (Platform.OS !== 'web') Vibration.vibrate([100, 100, 100]);
            }

            // Test finish
            if ((runType === 'test2k' && distanceRef.current >= 2) ||
                (runType === 'test3k' && distanceRef.current >= 3)) {
              finishRun();
            }
          }
        }

        coordsRef.current = [...coordsRef.current, newCoord];
        setCoords([...coordsRef.current]);
      },
    );
  };

  // ─── PAUSE / RESUME ──────────────────────────────────────────────────────────

  const pauseRun = () => {
    clearInterval(timerRef.current);
    locationRef.current?.remove();
    setPhase(PHASE.PAUSED);
    Speech.speak('ריצה מושהית', { language: 'he-IL' });
  };

  const resumeRun = async () => {
    setPhase(PHASE.ACTIVE);
    Speech.speak('ממשיכים!', { language: 'he-IL' });

    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);

    locationRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 5 },
      (loc) => {
        const { latitude, longitude, speed } = loc.coords;
        setCurrentCoord({ latitude, longitude });
        if (speed && speed > 0) {
          setSpeedKmh(speed * 3.6);
          setCurrentPace(60 / (speed * 3.6));
        }
      },
    );
  };

  // ─── FINISH ──────────────────────────────────────────────────────────────────

  const finishRun = useCallback(async () => {
    clearInterval(timerRef.current);
    locationRef.current?.remove();

    const run = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      distanceKm: Math.round(distanceRef.current * 100) / 100,
      durationSec: elapsedRef.current,
      avgPaceMinKm: elapsedRef.current > 0 && distanceRef.current > 0
        ? elapsedRef.current / 60 / distanceRef.current : 0,
      calories: calcCalories(distanceRef.current),
      coords: coordsRef.current,
      withLoad,
      runType,
    };

    await saveRun(run);

    const distTxt = run.distanceKm.toFixed(2);
    const timeTxt = formatTime(run.durationSec);
    const paceTxt = formatPace(run.avgPaceMinKm);

    Speech.speak(
      `ריצה הסתיימה! ${distTxt} ק"מ ב-${timeTxt}. קצב ממוצע ${paceTxt}. כל הכבוד!`,
      { language: 'he-IL', rate: 1.1 },
    );

    setPhase(PHASE.DONE);
  }, [withLoad, runType]);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      locationRef.current?.remove();
    };
  }, []);

  // ─── PACE COACH UI ───────────────────────────────────────────────────────────

  const PaceCoachBanner = () => {
    if (!paceGap || runType !== 'pace') return null;
    const { timeGapSec } = paceGap;
    if (!timeGapSec) return null;
    const abs = Math.abs(timeGapSec);
    const ahead = timeGapSec < -5;
    const behind = timeGapSec > 5;
    if (!ahead && !behind) {
      return (
        <View style={[styles.paceCoach, { backgroundColor: colors.green }]}>
          <Text style={styles.paceCoachText}>✓ מושלם — בדיוק בקצב!</Text>
        </View>
      );
    }
    return (
      <View style={[styles.paceCoach, { backgroundColor: behind ? colors.amber : colors.blue }]}>
        <Text style={styles.paceCoachText}>
          {behind ? `↑ הגבר — ${abs}ש' מאחור` : `↓ הורד — ${abs}ש' לפני`}
        </Text>
      </View>
    );
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  if (phase === PHASE.SETUP) return <SetupScreen {...{ runType, setRunType, withLoad, setWithLoad, targetDistance, setTargetDistance, targetMinutes, setTargetMinutes, onStart: startRun }} />;
  if (phase === PHASE.DONE) return <SummaryScreen elapsed={elapsed} distance={distance} calories={calories} avgPace={avgPace} coords={coords} onNew={() => setPhase(PHASE.SETUP)} />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation
        followsUserLocation={false}
        initialRegion={currentCoord ? {
          ...currentCoord, latitudeDelta: 0.003, longitudeDelta: 0.003,
        } : {
          latitude: 31.7683, longitude: 35.2137, latitudeDelta: 0.05, longitudeDelta: 0.05,
        }}
      >
        {coords.length > 1 && (
          <Polyline coordinates={coords} strokeColor={colors.blue} strokeWidth={4} />
        )}
        {currentCoord && (
          <Marker coordinate={currentCoord} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.dot} />
          </Marker>
        )}
      </MapView>

      {/* Pace Coach */}
      <PaceCoachBanner />

      {/* Stats Panel */}
      <View style={styles.panel}>
        {/* Row 1: Distance + Time */}
        <View style={styles.row}>
          <StatBox value={distance.toFixed(2)} label="ק״מ" big />
          <StatBox value={formatTime(elapsed)} label="זמן" big />
        </View>

        {/* Row 2: Pace + Speed + Calories */}
        <View style={styles.row}>
          <StatBox value={formatPace(currentPace)} label="קצב נוכחי" />
          <StatBox value={formatPace(avgPace)} label="קצב ממוצע" />
          <StatBox value={`${Math.round(speedKmh * 10) / 10}`} label="קמ״ש" />
          <StatBox value={`${calories}`} label="קל׳" />
        </View>

        {/* Buttons */}
        <View style={styles.btnRow}>
          {phase === PHASE.ACTIVE ? (
            <>
              <TouchableOpacity style={[styles.btn, styles.btnPause]} onPress={pauseRun}>
                <Text style={styles.btnTxt}>⏸ הפסקה</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnStop]} onPress={finishRun}>
                <Text style={styles.btnTxt}>■ סיים</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={[styles.btn, styles.btnStart]} onPress={resumeRun}>
                <Text style={styles.btnTxt}>▶ המשך</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnStop]} onPress={finishRun}>
                <Text style={styles.btnTxt}>■ סיים</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── SETUP SCREEN ─────────────────────────────────────────────────────────────

function SetupScreen({ runType, setRunType, withLoad, setWithLoad, targetDistance, setTargetDistance, targetMinutes, setTargetMinutes, onStart }) {
  const insets = useSafeAreaInsets();

  const types = [
    { id: 'free', label: 'חופשית', icon: '🏃' },
    { id: 'test2k', label: 'מבחן 2 ק"מ', icon: '⏱' },
    { id: 'test3k', label: 'מבחן 3 ק"מ', icon: '⏱' },
    { id: 'pace', label: 'יעד + Pace Coach', icon: '🎯' },
    { id: 'intervals', label: 'אינטרוולים', icon: '⚡' },
  ];

  return (
    <ScrollView
      style={[styles.setupContainer, { paddingTop: insets.top + 16 }]}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <Text style={styles.setupTitle}>🏃 הגדרת ריצה</Text>

      <Text style={styles.sectionLabel}>סוג ריצה</Text>
      {types.map((t) => (
        <TouchableOpacity
          key={t.id}
          style={[styles.typeRow, runType === t.id && styles.typeRowActive]}
          onPress={() => setRunType(t.id)}
        >
          <Text style={styles.typeIcon}>{t.icon}</Text>
          <Text style={[styles.typeLabel, runType === t.id && styles.typeLabelActive]}>{t.label}</Text>
          {runType === t.id && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>
      ))}

      {runType === 'pace' && (
        <View style={styles.targetBox}>
          <Text style={styles.sectionLabel}>יעד Pace Coach</Text>
          <View style={styles.targetRow}>
            <View style={styles.targetItem}>
              <Text style={styles.targetLabel}>מרחק (ק"מ)</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => setTargetDistance(d => Math.max(1, d - 0.5))}>
                  <Text style={styles.stepTxt}>-</Text>
                </TouchableOpacity>
                <Text style={styles.stepVal}>{targetDistance}</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => setTargetDistance(d => Math.min(42, d + 0.5))}>
                  <Text style={styles.stepTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.targetItem}>
              <Text style={styles.targetLabel}>זמן יעד (דקות)</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => setTargetMinutes(m => Math.max(1, m - 1))}>
                  <Text style={styles.stepTxt}>-</Text>
                </TouchableOpacity>
                <Text style={styles.stepVal}>{targetMinutes}</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => setTargetMinutes(m => m + 1)}>
                  <Text style={styles.stepTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <Text style={styles.paceTarget}>
            קצב יעד: {formatPace(targetMinutes / targetDistance)} לק"מ
          </Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>ציוד</Text>
      <TouchableOpacity
        style={[styles.typeRow, withLoad && styles.typeRowActive]}
        onPress={() => setWithLoad(!withLoad)}
      >
        <Text style={styles.typeIcon}>🎒</Text>
        <Text style={[styles.typeLabel, withLoad && styles.typeLabelActive]}>ריצה עם עומס (כומתה / אפוד)</Text>
        {withLoad && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.startBtn} onPress={onStart}>
        <Text style={styles.startBtnTxt}>🏁 התחל ריצה</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── SUMMARY SCREEN ───────────────────────────────────────────────────────────

function SummaryScreen({ elapsed, distance, calories, avgPace, coords, onNew }) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.summaryContainer, { paddingTop: insets.top + 16 }]}
      contentContainerStyle={{ paddingBottom: 60 }}
    >
      <Text style={styles.summaryTitle}>🎉 ריצה הסתיימה!</Text>

      {coords.length > 1 && (
        <MapView
          style={styles.summaryMap}
          scrollEnabled={false}
          zoomEnabled={false}
          initialRegion={{
            latitude: coords[Math.floor(coords.length / 2)].latitude,
            longitude: coords[Math.floor(coords.length / 2)].longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Polyline coordinates={coords} strokeColor={colors.blue} strokeWidth={4} />
          <Marker coordinate={coords[0]}>
            <View style={[styles.dot, { backgroundColor: colors.green }]} />
          </Marker>
          <Marker coordinate={coords[coords.length - 1]}>
            <View style={[styles.dot, { backgroundColor: colors.red }]} />
          </Marker>
        </MapView>
      )}

      <View style={styles.summaryGrid}>
        <SummaryCard icon="📏" value={`${distance.toFixed(2)} ק"מ`} label="מרחק" />
        <SummaryCard icon="⏱" value={formatTime(elapsed)} label="זמן כולל" />
        <SummaryCard icon="⚡" value={`${formatPace(avgPace)} /ק"מ`} label="קצב ממוצע" />
        <SummaryCard icon="🔥" value={`${calories} קל'`} label="קלוריות" />
      </View>

      <TouchableOpacity style={styles.startBtn} onPress={onNew}>
        <Text style={styles.startBtnTxt}>🏃 ריצה חדשה</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── SUB COMPONENTS ───────────────────────────────────────────────────────────

function StatBox({ value, label, big }) {
  return (
    <View style={[styles.statBox, big && styles.statBoxBig]}>
      <Text style={[styles.statValue, big && styles.statValueBig]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SummaryCard({ icon, value, label }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryIcon}>{icon}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.slate900 },
  map: { flex: 1 },
  paceCoach: {
    marginHorizontal: 16, marginTop: 8, borderRadius: 12,
    paddingVertical: 10, alignItems: 'center',
  },
  paceCoachText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  panel: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  row: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  statBox: {
    alignItems: 'center', flex: 1,
    borderRightWidth: 1, borderRightColor: colors.slate100,
  },
  statBoxBig: {},
  statValue: { fontSize: 20, fontWeight: '800', color: colors.slate900 },
  statValueBig: { fontSize: 36, color: colors.blue },
  statLabel: { fontSize: 11, color: colors.slate400, fontWeight: '600', marginTop: 2 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 8 },
  btn: {
    flex: 1, paddingVertical: 16, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  btnStart: { backgroundColor: colors.green },
  btnPause: { backgroundColor: colors.amber },
  btnStop: { backgroundColor: colors.red },
  btnTxt: { color: colors.white, fontWeight: '800', fontSize: 16 },
  dot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.blue,
    borderWidth: 2, borderColor: colors.white,
  },
  // Setup
  setupContainer: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  setupTitle: { fontSize: 24, fontWeight: '900', color: colors.slate900, marginBottom: 24, textAlign: 'right' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.slate400,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 16, textAlign: 'right',
  },
  typeRow: {
    flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: colors.white,
    borderRadius: 14, padding: 16, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderWidth: 2, borderColor: 'transparent',
  },
  typeRowActive: { borderColor: colors.blue, backgroundColor: colors.blueLight },
  typeIcon: { fontSize: 20, marginLeft: 12 },
  typeLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.slate700, textAlign: 'right' },
  typeLabelActive: { color: colors.blue },
  checkmark: { fontSize: 16, color: colors.blue, fontWeight: '800' },
  targetBox: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginTop: 8 },
  targetRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  targetItem: { alignItems: 'center' },
  targetLabel: { fontSize: 12, color: colors.slate500, marginBottom: 8, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.blueMid, alignItems: 'center', justifyContent: 'center',
  },
  stepTxt: { fontSize: 20, color: colors.blue, fontWeight: '700' },
  stepVal: { fontSize: 24, fontWeight: '800', color: colors.slate900, minWidth: 40, textAlign: 'center' },
  paceTarget: {
    textAlign: 'center', marginTop: 12, fontSize: 14,
    fontWeight: '700', color: colors.blue,
  },
  startBtn: {
    backgroundColor: colors.blue, borderRadius: 20,
    paddingVertical: 20, marginTop: 24, alignItems: 'center',
    shadowColor: colors.blue, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  startBtnTxt: { color: colors.white, fontSize: 18, fontWeight: '900' },
  // Summary
  summaryContainer: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  summaryTitle: { fontSize: 26, fontWeight: '900', color: colors.slate900, textAlign: 'center', marginBottom: 20 },
  summaryMap: { height: 200, borderRadius: 20, marginBottom: 20, overflow: 'hidden' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  summaryCard: {
    backgroundColor: colors.white, borderRadius: 16, padding: 16,
    width: (width - 52) / 2, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  summaryIcon: { fontSize: 28, marginBottom: 8 },
  summaryValue: { fontSize: 18, fontWeight: '800', color: colors.slate900, textAlign: 'center' },
  summaryLabel: { fontSize: 12, color: colors.slate400, fontWeight: '600', marginTop: 4 },
});
