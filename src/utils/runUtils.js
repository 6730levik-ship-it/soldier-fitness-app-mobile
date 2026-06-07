// חישוב מרחק בין שתי נקודות GPS (Haversine formula)
export function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // km
}

// פורמט זמן: שניות → MM:SS או HH:MM:SS
export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// קצב דקות לק"מ → MM:SS
export function formatPace(paceMinPerKm) {
  if (!paceMinPerKm || !isFinite(paceMinPerKm) || paceMinPerKm > 99) return '--:--';
  const m = Math.floor(paceMinPerKm);
  const s = Math.round((paceMinPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// חישוב קלוריות משוערות
export function calcCalories(distanceKm, weightKg = 75) {
  return Math.round(distanceKm * weightKg * 1.036);
}

// Pace Coach: חישוב פער מהיעד
export function calcPaceGap(elapsedSec, distanceKm, targetTimeSec, targetDistanceKm) {
  if (distanceKm < 0.05) return null;
  const expectedDistanceNow = (elapsedSec / targetTimeSec) * targetDistanceKm;
  const gapKm = distanceKm - expectedDistanceNow;
  // פער בשניות: גמ"ש שנותרות מול יעד
  const remainingDist = targetDistanceKm - distanceKm;
  const remainingTime = targetTimeSec - elapsedSec;
  if (remainingDist <= 0) return { done: true };
  const currentPace = elapsedSec / distanceKm / 60; // min/km
  const targetPace = targetTimeSec / targetDistanceKm / 60; // min/km
  const paceGapSec = Math.round((currentPace - targetPace) * 60);
  const projectedFinish = elapsedSec + remainingDist * currentPace * 60;
  const timeGapSec = Math.round(projectedFinish - targetTimeSec);
  return { paceGapSec, timeGapSec, gapKm, currentPace, targetPace };
}
