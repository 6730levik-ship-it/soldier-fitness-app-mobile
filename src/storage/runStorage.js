import AsyncStorage from '@react-native-async-storage/async-storage';

const RUNS_KEY = 'tacfit_runs';

export async function saveRun(run) {
  try {
    const existing = await getRuns();
    const updated = [run, ...existing];
    await AsyncStorage.setItem(RUNS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('saveRun error', e);
  }
}

export async function getRuns() {
  try {
    const data = await AsyncStorage.getItem(RUNS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export async function deleteRun(id) {
  try {
    const runs = await getRuns();
    const updated = runs.filter((r) => r.id !== id);
    await AsyncStorage.setItem(RUNS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('deleteRun error', e);
  }
}
