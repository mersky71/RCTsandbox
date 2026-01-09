// storage.js
const KEY_ACTIVE = "erw_activeChallenge_v1";
const KEY_LAST = "erw_lastChallenge_v1";
const KEY_HISTORY = "erw_challengeHistory_v1";

export const CUTOFF_HOUR = 3; // 3:00 AM local time
export const MAX_RECENT_HISTORY = 20;

export function dayKeyFor(date, cutoffHour = CUTOFF_HOUR) {
  // Challenge "day" is based on local time minus cutoff hours.
  const shifted = new Date(date.getTime() - cutoffHour * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, "0");
  const d = String(shifted.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function loadActiveChallenge() {
  try {
    const raw = localStorage.getItem(KEY_ACTIVE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveActiveChallenge(ch) {
  localStorage.setItem(KEY_ACTIVE, JSON.stringify(ch));
}

export function clearActiveChallenge() {
  localStorage.removeItem(KEY_ACTIVE);
}

export function loadLastChallenge() {
  try {
    const raw = localStorage.getItem(KEY_LAST);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLastChallenge(ch) {
  localStorage.setItem(KEY_LAST, JSON.stringify(ch));
}

export function archiveActiveToLastIfPresent() {
  const active = loadActiveChallenge();
  if (active) saveLastChallenge(active);
}

export function startNewChallenge({ tagsText, fundraisingLink }) {
  // Archive any existing active challenge before overwriting.
  archiveActiveToLastIfPresent();

  const now = new Date();
  const dayKey = dayKeyFor(now);

  const challenge = {
    id: crypto.randomUUID(),
    dayKey,
    startedAt: now.toISOString(),
    settings: {
      tagsText: tagsText ?? "",
      fundraisingLink: fundraisingLink ?? ""
    },
    // Events are authoritative; numbering is derived from order.
    // event: { id, rideId, park, mode, timeISO, rideName }
    events: []
  };

  saveActiveChallenge(challenge);
  return challenge;
}

export function isActiveChallengeForNow(ch) {
  if (!ch) return false;
  const nowKey = dayKeyFor(new Date());
  return ch.dayKey === nowKey;
}

/* ==========================
   Saved challenge history
   ========================== */

function safeClone(obj) {
  // Works fine for our plain JSON objects
  return JSON.parse(JSON.stringify(obj));
}

export function loadChallengeHistory() {
  try {
    const raw = localStorage.getItem(KEY_HISTORY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveChallengeHistory(history) {
  localStorage.setItem(KEY_HISTORY, JSON.stringify(history));
}

function normalizeHistory(history) {
  // De-dupe by id, keep newest first
  const seen = new Set();
  const out = [];
  for (const item of history) {
    if (!item || !item.id) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }

  const saved = out.filter(x => x.saved === true);
  const recent = out.filter(x => x.saved !== true);

  // Keep ALL saved, but only the most recent 20 in the recent section
  const trimmedRecent = recent.slice(0, MAX_RECENT_HISTORY);

  return [...saved, ...trimmedRecent]
    // And then sort overall newest-first for storage convenience
    .sort((a, b) => {
      const ta = Date.parse(a.endedAt || a.startedAt || "") || 0;
      const tb = Date.parse(b.endedAt || b.startedAt || "") || 0;
      return tb - ta;
    });
}

export function archiveChallengeToHistory(ch, { saved = false } = {}) {
  if (!ch || !ch.id) return;

  const now = new Date().toISOString();
  const entry = safeClone(ch);

  entry.endedAt = entry.endedAt || now;
  entry.saved = !!saved;
  if (saved && !entry.savedAt) entry.savedAt = now;

  // Ensure dayKey is present even if older objects were missing it
  if (!entry.dayKey) {
    const guess = entry.startedAt ? new Date(entry.startedAt) : new Date();
    entry.dayKey = dayKeyFor(guess);
  }

  // Put newest at front, then normalize
  const hist = loadChallengeHistory();
  const next = normalizeHistory([entry, ...hist]);

  saveChallengeHistory(next);
}

export function setChallengeSaved(id, saved = true) {
  const hist = loadChallengeHistory();
  const now = new Date().toISOString();

  const next = hist.map(h => {
    if (!h || h.id !== id) return h;
    const copy = safeClone(h);
    copy.saved = !!saved;
    if (saved && !copy.savedAt) copy.savedAt = now;
    if (!saved) delete copy.savedAt;
    return copy;
  });

  saveChallengeHistory(normalizeHistory(next));
}

export function deleteChallengeFromHistory(id) {
  const hist = loadChallengeHistory();
  const next = hist.filter(h => h && h.id !== id);
  saveChallengeHistory(normalizeHistory(next));
}
