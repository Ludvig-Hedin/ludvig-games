const KEY = 'hoop-rush:v1';
export const DEFAULT_SETTINGS = { effects: 0.8, music: 0.28, muted: false, musicOn: false, quality: 'auto', theme: 'midnight', skin: 'classic' };
export function readProfile() {
  const blank = { bests: {}, games: 0, baskets: 0, wins: 0, streak: 0, bestStreak: 0, history: [], leaderboard: [], daily: {}, completedOnline: {}, settings: { ...DEFAULT_SETTINGS } };
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!value || typeof value !== 'object') return blank;
    return { ...blank, ...value, settings: { ...DEFAULT_SETTINGS, ...value.settings }, history: Array.isArray(value.history) ? value.history.slice(0, 12) : [], leaderboard: Array.isArray(value.leaderboard) ? value.leaderboard.slice(0, 10) : [] };
  } catch { return blank; }
}
export function saveProfile(profile) {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* Private browsing can deny storage. The match still works. */ }
}
export function recordMatch(profile, result) {
  const saved = readProfile();
  if (saved.games > profile.games) profile = { ...saved, settings: profile.settings };
  const key = result.bestKey || 'classic-60';
  const previous = Number(profile.bests[key]) || 0;
  if (result.matchId && (profile.completedOnline?.[result.matchId] || saved.completedOnline?.[result.matchId])) return { profile, newBest: false, previousBest: previous, unlocked: null };
  const score = result.scores[0];
  const win = result.mode !== 'solo' && (result.winner !== undefined ? result.winner === 0 : score > result.scores[1]);
  const next = { ...profile, bests: { ...profile.bests, [key]: Math.max(previous, score) }, games: profile.games + 1, baskets: profile.baskets + result.made[0], wins: profile.wins + Number(win), streak: result.mode === 'solo' ? profile.streak : win ? profile.streak + 1 : 0 };
  if (result.matchId) next.completedOnline = Object.fromEntries([...Object.entries(profile.completedOnline || {}), [result.matchId, Date.now()]].slice(-250));
  next.bestStreak = Math.max(next.bestStreak, next.streak);
  const item = { id: result.matchId || Date.now(), score, opponent: result.mode === 'solo' ? null : result.scores[1], mode: result.mode, rule: result.rule, duration: result.duration, difficulty: result.difficulty, accuracy: result.shots[0] ? Math.round(result.made[0] / result.shots[0] * 100) : 0, bestKey: key };
  next.history = [item, ...profile.history].slice(0, 12);
  next.leaderboard = [item, ...profile.leaderboard].sort((a, b) => b.score - a.score).slice(0, 10);
  if (result.daily) next.daily = { ...next.daily, [result.daily.date]: Math.max(next.daily[result.daily.date] || 0, score) };
  saveProfile(next);
  return { profile: next, newBest: score > previous, previousBest: previous, unlocked: next.baskets >= 20 && profile.baskets < 20 ? 'Arctic ball unlocked' : next.games >= 5 && profile.games < 5 ? 'Midnight ball unlocked' : null };
}
export function dailyChallenge() {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let hash = 0; for (const char of date) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const choices = [
    { challenge: 'moving', title: 'Moving target', target: 36, description: 'A moving hoop. 60 seconds. Reach 36 points.' },
    { challenge: 'precision', title: 'Thread the needle', target: 28, description: 'A tighter rim. 60 seconds. Reach 28 points.' },
    { challenge: 'distance', title: 'From downtown', target: 32, description: 'Step back. 60 seconds. Reach 32 points.' },
  ];
  return { ...choices[hash % choices.length], date, seed: hash };
}
