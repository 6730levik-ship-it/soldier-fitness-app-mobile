import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { getRuns, deleteRun } from '../storage/runStorage';
import { formatTime, formatPace } from '../utils/runUtils';

export default function HistoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [runs, setRuns] = useState([]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    load();
    return unsub;
  }, [navigation]);

  const load = async () => {
    const data = await getRuns();
    setRuns(data);
  };

  const handleDelete = (id) => {
    Alert.alert('מחיקת ריצה', 'בטוח שרוצה למחוק?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive',
        onPress: async () => {
          await deleteRun(id);
          load();
        },
      },
    ]);
  };

  const totalKm = runs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const totalTime = runs.reduce((s, r) => s + (r.durationSec || 0), 0);
  const bestPace = runs.filter(r => r.avgPaceMinKm > 0).map(r => r.avgPaceMinKm);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>היסטוריית ריצות</Text>

      {/* Summary banner */}
      {runs.length > 0 && (
        <View style={styles.summary}>
          <View style={styles.sumItem}>
            <Text style={styles.sumVal}>{Math.round(totalKm * 10) / 10}</Text>
            <Text style={styles.sumLabel}>ק"מ סה"כ</Text>
          </View>
          <View style={styles.sumItem}>
            <Text style={styles.sumVal}>{runs.length}</Text>
            <Text style={styles.sumLabel}>ריצות</Text>
          </View>
          <View style={styles.sumItem}>
            <Text style={styles.sumVal}>{formatTime(totalTime)}</Text>
            <Text style={styles.sumLabel}>זמן סה"כ</Text>
          </View>
          <View style={styles.sumItem}>
            <Text style={styles.sumVal}>{bestPace.length > 0 ? formatPace(Math.min(...bestPace)) : '--'}</Text>
            <Text style={styles.sumLabel}>שיא קצב</Text>
          </View>
        </View>
      )}

      <FlatList
        data={runs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏁</Text>
            <Text style={styles.emptyText}>אין ריצות עדיין</Text>
          </View>
        }
        renderItem={({ item }) => {
          const date = new Date(item.date).toLocaleDateString('he-IL', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          });
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardIcon}>{item.withLoad ? '🎒' : '🏃'}</Text>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardDate}>{date}</Text>
                  <Text style={styles.cardType}>{getTypeLabel(item.runType)}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(item.id)}>
                  <Text style={styles.deleteBtn}>🗑</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.cardStats}>
                <StatChip label="מרחק" value={`${item.distanceKm?.toFixed(2)} ק"מ`} />
                <StatChip label="זמן" value={formatTime(item.durationSec)} />
                <StatChip label="קצב ממוצע" value={`${formatPace(item.avgPaceMinKm)} /ק"מ`} />
                <StatChip label="קלוריות" value={`${item.calories || 0} קל'`} />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function StatChip({ label, value }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipVal}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

function getTypeLabel(type) {
  const m = { free: 'חופשית', test2k: 'מבחן 2 ק"מ', test3k: 'מבחן 3 ק"מ', pace: 'Pace Coach', intervals: 'אינטרוולים' };
  return m[type] || 'ריצה';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '900', color: colors.slate900, paddingHorizontal: 20, marginBottom: 16 },
  summary: {
    flexDirection: 'row', backgroundColor: colors.blue,
    marginHorizontal: 20, borderRadius: 16, padding: 16,
    justifyContent: 'space-around', marginBottom: 16,
  },
  sumItem: { alignItems: 'center' },
  sumVal: { color: colors.white, fontSize: 18, fontWeight: '800' },
  sumLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: colors.slate400, fontWeight: '600' },
  card: {
    backgroundColor: colors.white, borderRadius: 16, padding: 16,
    marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardIcon: { fontSize: 28, marginLeft: 12 },
  cardInfo: { flex: 1 },
  cardDate: { fontSize: 13, fontWeight: '700', color: colors.slate700 },
  cardType: { fontSize: 11, color: colors.slate400, fontWeight: '500', marginTop: 2 },
  deleteBtn: { fontSize: 20, padding: 4 },
  cardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.slate50, borderRadius: 10,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  chipVal: { fontSize: 13, fontWeight: '700', color: colors.slate800 },
  chipLabel: { fontSize: 10, color: colors.slate400, fontWeight: '500', marginTop: 1 },
});
