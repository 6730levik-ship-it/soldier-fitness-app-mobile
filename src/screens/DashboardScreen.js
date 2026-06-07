import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { getRuns } from '../storage/runStorage';
import { formatTime, formatPace } from '../utils/runUtils';

export default function DashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [runs, setRuns] = useState([]);
  const [totalKm, setTotalKm] = useState(0);
  const [totalRuns, setTotalRuns] = useState(0);
  const [bestPace, setBestPace] = useState(0);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadData);
    loadData();
    return unsubscribe;
  }, [navigation]);

  const loadData = async () => {
    const data = await getRuns();
    setRuns(data.slice(0, 5));
    setTotalRuns(data.length);
    const km = data.reduce((s, r) => s + (r.distanceKm || 0), 0);
    setTotalKm(Math.round(km * 10) / 10);
    const paces = data.filter(r => r.avgPaceMinKm > 0).map(r => r.avgPaceMinKm);
    if (paces.length > 0) setBestPace(Math.min(...paces));
  };

  const today = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>שלום, לוחם 👋</Text>
        <Text style={styles.date}>{today}</Text>
      </View>

      {/* Readiness Score */}
      <View style={styles.readinessCard}>
        <View style={styles.readinessLeft}>
          <Text style={styles.readinessLabel}>ציון מוכנות מבצעית</Text>
          <Text style={styles.readinessScore}>
            {totalRuns > 0 ? Math.min(99, 60 + totalRuns * 5) : '--'}
          </Text>
          <Text style={styles.readinessNote}>
            {totalRuns > 0 ? 'כושר גבוה ✓' : 'התחל לרוץ כדי לחשב'}
          </Text>
        </View>
        <View style={styles.readinessRight}>
          <TouchableOpacity style={styles.startRunBtn} onPress={() => navigation.navigate('Run')}>
            <Text style={styles.startRunBtnTxt}>🏃 התחל ריצה</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>📏</Text>
          <Text style={styles.statValue}>{totalKm}</Text>
          <Text style={styles.statLabel}>ק"מ כולל</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>🏃</Text>
          <Text style={styles.statValue}>{totalRuns}</Text>
          <Text style={styles.statLabel}>ריצות</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>⚡</Text>
          <Text style={styles.statValue}>{bestPace > 0 ? formatPace(bestPace) : '--'}</Text>
          <Text style={styles.statLabel}>שיא קצב</Text>
        </View>
      </View>

      {/* Recent Runs */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>ריצות אחרונות</Text>
        <TouchableOpacity onPress={() => navigation.navigate('History')}>
          <Text style={styles.sectionLink}>הכל</Text>
        </TouchableOpacity>
      </View>

      {runs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🏁</Text>
          <Text style={styles.emptyText}>עוד לא רצת — בוא נתחיל!</Text>
          <TouchableOpacity style={styles.startRunBtn} onPress={() => navigation.navigate('Run')}>
            <Text style={styles.startRunBtnTxt}>🏃 לריצה הראשונה</Text>
          </TouchableOpacity>
        </View>
      ) : (
        runs.map((run) => (
          <RunRow key={run.id} run={run} />
        ))
      )}
    </ScrollView>
  );
}

function RunRow({ run }) {
  const date = new Date(run.date).toLocaleDateString('he-IL', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  return (
    <View style={styles.runRow}>
      <View style={styles.runLeft}>
        <Text style={styles.runIcon}>{run.withLoad ? '🎒' : '🏃'}</Text>
      </View>
      <View style={styles.runMid}>
        <Text style={styles.runDate}>{date}</Text>
        <Text style={styles.runType}>{getRunTypeLabel(run.runType)}</Text>
      </View>
      <View style={styles.runRight}>
        <Text style={styles.runDist}>{run.distanceKm?.toFixed(2)} ק"מ</Text>
        <Text style={styles.runTime}>{formatTime(run.durationSec)}</Text>
        <Text style={styles.runPace}>{formatPace(run.avgPaceMinKm)} /ק"מ</Text>
      </View>
    </View>
  );
}

function getRunTypeLabel(type) {
  const labels = {
    free: 'ריצה חופשית',
    test2k: 'מבחן 2 ק"מ',
    test3k: 'מבחן 3 ק"מ',
    pace: 'Pace Coach',
    intervals: 'אינטרוולים',
  };
  return labels[type] || 'ריצה';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  header: { marginBottom: 20 },
  greeting: { fontSize: 24, fontWeight: '900', color: colors.slate900 },
  date: { fontSize: 13, color: colors.slate400, fontWeight: '500', marginTop: 2 },
  readinessCard: {
    backgroundColor: colors.blue, borderRadius: 24, padding: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
    shadowColor: colors.blue, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 10,
  },
  readinessLeft: {},
  readinessLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  readinessScore: { color: colors.white, fontSize: 52, fontWeight: '900', lineHeight: 60 },
  readinessNote: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  readinessRight: {},
  startRunBtn: {
    backgroundColor: colors.white, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  startRunBtnTxt: { color: colors.blue, fontWeight: '800', fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: colors.white, borderRadius: 16,
    padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  statIcon: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.slate900 },
  statLabel: { fontSize: 11, color: colors.slate400, fontWeight: '600', marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.slate700, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionLink: { fontSize: 12, fontWeight: '600', color: colors.blue },
  emptyCard: {
    backgroundColor: colors.white, borderRadius: 20, padding: 32,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15, color: colors.slate500, fontWeight: '600', marginBottom: 16 },
  runRow: {
    backgroundColor: colors.white, borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  runLeft: { marginLeft: 12 },
  runIcon: { fontSize: 24 },
  runMid: { flex: 1 },
  runDate: { fontSize: 13, fontWeight: '700', color: colors.slate700 },
  runType: { fontSize: 11, color: colors.slate400, fontWeight: '500', marginTop: 2 },
  runRight: { alignItems: 'flex-end' },
  runDist: { fontSize: 16, fontWeight: '800', color: colors.blue },
  runTime: { fontSize: 12, color: colors.slate500, fontWeight: '600' },
  runPace: { fontSize: 11, color: colors.slate400, fontWeight: '500' },
});
