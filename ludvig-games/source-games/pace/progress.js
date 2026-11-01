(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PaceProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var KEY = 'pace.progress.v1';
  var DIFFICULTIES = ['easy', 'medium', 'hard'];
  var MODES = ['sprint', 'accuracy', 'daily', 'weakness', 'mistakes', 'lesson'];
  var MAX_HISTORY = 200;
  var MAX_DAYS = 370;
  var MAX_RECORDED_IDS = 2048;
  var MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  var defaultSettings = { sound: false, motion: true, difficulty: 'easy', duration: 60, mode: 'sprint' };
  var engine = root && root.PaceEngine;
  if (!engine && typeof require === 'function') {
    try { engine = require('./engine.js'); } catch (_) { /* The fallback helpers also support isolated use. */ }
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function number(value, fallback, min, max) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  }
  function integer(value, fallback, min, max) { return Math.round(number(value, fallback, min, max)); }
  function dateKey(date) {
    if (engine && engine.dateKey) return engine.dateKey(date);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function shiftDay(key, amount) {
    var date = new Date(key + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }
  function streak(days, today) {
    if (engine && engine.getStreak) return engine.getStreak(days, today);
    var set = new Set(days), current = set.has(today) ? today : shiftDay(today, -1), count = 0;
    while (set.has(current)) { count++; current = shiftDay(current, -1); }
    return count;
  }
  function playerLevel(xp) {
    if (engine && engine.getLevel) return engine.getLevel(xp);
    return { level: Math.floor(xp / 250) + 1, xpIntoLevel: xp % 250, xpForNextLevel: 250, progress: (xp % 250) / 250, title: 'Typist' };
  }
  function fresh() {
    return { v: 1, xp: 0, days: [], history: [], lessons: {}, missedWords: {}, settings: clone(defaultSettings), dailyResults: {}, recordedIds: [] };
  }
  function cleanWord(word) {
    if (typeof word !== 'string') return null;
    word = word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
    return /^[a-z]+(?:['-][a-z]+)*$/.test(word) && word.length <= 40 ? word : null;
  }
  function wordList(words) {
    if (!Array.isArray(words)) return [];
    return Array.from(new Set(words.map(cleanWord).filter(Boolean))).slice(0, 100);
  }
  function sanitizeSettings(input, base) {
    var output = Object.assign({}, base || defaultSettings);
    if (!object(input)) return output;
    if (typeof input.sound === 'boolean') output.sound = input.sound;
    if (typeof input.motion === 'boolean') output.motion = input.motion;
    if (DIFFICULTIES.indexOf(input.difficulty) >= 0) output.difficulty = input.difficulty;
    if ([30, 60, 120].indexOf(input.duration) >= 0) output.duration = input.duration;
    if (MODES.indexOf(input.mode) >= 0) output.mode = input.mode;
    return output;
  }
  function normalizeHistory(entry) {
    if (!object(entry) || typeof entry.id !== 'string' || !entry.id || entry.id.length > 200 || !validDate(entry.date)) return null;
    if (MODES.indexOf(entry.mode) < 0 || DIFFICULTIES.indexOf(entry.difficulty) < 0) return null;
    var at = typeof entry.at === 'string' && Number.isFinite(Date.parse(entry.at)) ? entry.at : entry.date + 'T12:00:00.000Z';
    return {
      id: entry.id, date: entry.date, at: at, mode: entry.mode, difficulty: entry.difficulty,
      dailyDate: entry.mode === 'daily' ? (validDate(entry.dailyDate) ? entry.dailyDate : entry.date) : null,
      duration: number(entry.duration, 0, 0, 7200), device: entry.device === 'mobile' ? 'mobile' : 'desktop',
      wpm: number(entry.wpm, 0, 0, 2000), accuracy: number(entry.accuracy, 0, 0, 100),
      points: integer(entry.points, 0, 0, 10000000), xp: integer(entry.xp, 0, 0, 10000),
      elapsed: number(entry.elapsed, 0, 0, 7200), correctChars: integer(entry.correctChars, 0, 0, 1000000),
      attempts: integer(entry.attempts, 0, 0, 1000000), errors: integer(entry.errors, 0, 0, 1000000),
      bestCombo: integer(entry.bestCombo, 0, 0, 1000000), perfectWords: integer(entry.perfectWords, 0, 0, 100000),
      missedWords: wordList(entry.missedWords),
      levelId: Number.isInteger(entry.levelId) && entry.levelId >= 1 && entry.levelId <= 12 ? entry.levelId : null,
      reason: entry.reason === 'complete' ? 'complete' : 'time'
    };
  }
  function normalize(input) {
    if (!object(input) || input.v !== 1) throw new Error('This is not a supported Pace progress file.');
    if (typeof input.xp !== 'number' || !Number.isFinite(input.xp) || input.xp < 0 || input.xp > 1000000000) throw new Error('The progress file contains invalid XP.');
    if (!Array.isArray(input.days) || !Array.isArray(input.history)) throw new Error('The progress file is missing activity history.');
    if (input.days.some(function (day) { return !validDate(day); })) throw new Error('The progress file contains invalid practice dates.');
    if (input.history.length > 10000 || input.days.length > 10000) throw new Error('The progress file is too large.');
    var state = fresh(), seen = new Set();
    state.xp = Math.round(input.xp);
    state.days = Array.from(new Set(input.days)).sort().slice(-MAX_DAYS);
    state.history = input.history.map(function (item) {
      var entry = normalizeHistory(item);
      if (!entry) throw new Error('The progress file contains an invalid session.');
      return entry;
    }).filter(function (entry) { if (seen.has(entry.id)) return false; seen.add(entry.id); return true; })
      .sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); }).slice(0, MAX_HISTORY);
    if (object(input.lessons)) {
      Object.keys(input.lessons).forEach(function (key) {
        var lesson = input.lessons[key];
        if (!/^(?:[1-9]|1[0-2])$/.test(key) || !object(lesson)) return;
        state.lessons[key] = {
          completed: lesson.completed === true,
          bestWpm: number(lesson.bestWpm, 0, 0, 2000), bestAccuracy: number(lesson.bestAccuracy, 0, 0, 100),
          attempts: integer(lesson.attempts, 0, 0, 1000000),
          completedAt: typeof lesson.completedAt === 'string' && Number.isFinite(Date.parse(lesson.completedAt)) ? lesson.completedAt : null
        };
      });
    }
    if (object(input.missedWords)) {
      Object.keys(input.missedWords).map(function (key) {
        return [cleanWord(key), integer(input.missedWords[key], 0, 0, 1000000)];
      }).filter(function (entry) { return entry[0] && entry[1] > 0; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 100)
        .forEach(function (entry) { state.missedWords[entry[0]] = entry[1]; });
    }
    if (object(input.dailyResults)) {
      Object.keys(input.dailyResults).filter(validDate).sort().slice(-MAX_DAYS).forEach(function (key) {
        var entry = input.dailyResults[key];
        if (!object(entry)) return;
        state.dailyResults[key] = {
          attempts: integer(entry.attempts, 0, 0, 1000000), bestWpm: number(entry.bestWpm, 0, 0, 2000),
          bestAccuracy: number(entry.bestAccuracy, 0, 0, 100), bestPoints: integer(entry.bestPoints, 0, 0, 10000000),
          bonusClaimed: entry.bonusClaimed === true
        };
      });
    }
    state.settings = sanitizeSettings(input.settings);
    var recorded = Array.isArray(input.recordedIds) ? input.recordedIds.filter(function (id) { return typeof id === 'string' && id.length > 0 && id.length <= 200; }) : [];
    state.recordedIds = Array.from(new Set(recorded.concat(state.history.map(function (entry) { return entry.id; })))).slice(-MAX_RECORDED_IDS);
    return state;
  }

  function createStore(storage) {
    var state = fresh(), available = true, storageError = null, dirty = false, lastPersistedRaw = null;
    if (arguments.length === 0) {
      try { storage = root.localStorage; } catch (_) { storage = null; }
    }
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      available = false;
      storageError = 'This browser cannot save progress. Export it before closing this tab.';
    } else {
      try {
        var raw = storage.getItem(KEY);
        lastPersistedRaw = raw;
        if (raw) {
          try {
            if (raw.length > MAX_IMPORT_BYTES) throw new Error('Too large');
            state = normalize(JSON.parse(raw));
          } catch (_) {
            storageError = 'Saved progress could not be read. A fresh profile is active.';
          }
        }
      } catch (_) {
        available = false;
        storageError = 'This browser cannot read saved progress. Export it before closing this tab.';
      }
    }

    function refreshPersisted() {
      // A failed write leaves newer progress only in memory. Never overwrite it with
      // the older persisted snapshot while recovering from denied/quota-limited storage.
      if (dirty || !storage || typeof storage.getItem !== 'function') return;
      try {
        var raw = storage.getItem(KEY);
        if (raw === lastPersistedRaw) return;
        var next;
        try {
          if (raw && raw.length > MAX_IMPORT_BYTES) throw new Error('Too large');
          next = raw ? normalize(JSON.parse(raw)) : fresh();
        } catch (_) {
          storageError = 'Saved progress could not be read. Your current progress is still available in this tab.';
          lastPersistedRaw = raw;
          return;
        }
        state = next;
        lastPersistedRaw = raw;
        available = true;
        storageError = null;
      } catch (_) {
        available = false;
        storageError = 'This browser cannot read saved progress. Export it before closing this tab.';
      }
    }
    function persist() {
      dirty = true;
      if (!storage || typeof storage.setItem !== 'function') return false;
      try {
        var raw = JSON.stringify(state);
        storage.setItem(KEY, raw);
        lastPersistedRaw = raw;
        dirty = false;
        available = true;
        storageError = null;
        return true;
      }
      catch (_) { available = false; storageError = 'Progress is only saved in this tab. Export it before closing.'; return false; }
    }
    function get() { refreshPersisted(); return clone(state); }
    function response(saved, xpEarned, before, today, completedLesson, dailyFirst, reason) {
      return {
        saved: saved, persisted: available, xpEarned: xpEarned,
        levelBefore: playerLevel(before), levelAfter: playerLevel(state.xp),
        streak: streak(state.days, today), completedLesson: completedLesson,
        dailyFirst: dailyFirst, reason: reason || null, state: get()
      };
    }
    function record(result, config, date) {
      refreshPersisted();
      result = object(result) ? result : {};
      config = object(config) ? config : {};
      date = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
      var today = dateKey(date), before = state.xp;
      var reason = result.reason;
      if (reason !== 'complete' && reason !== 'time') return response(false, 0, before, today, false, false, 'unfinished');
      if (number(result.attempts, 0, 0, 1000000) < 10 || number(result.elapsed, 0, 0, 7200) < 5) return response(false, 0, before, today, false, false, 'too-short');
      var id = config.runId || result.runId || result.id;
      if (typeof id !== 'string' || !id || id.length > 200) return response(false, 0, before, today, false, false, 'missing-id');
      if (state.recordedIds.indexOf(id) >= 0) return response(false, 0, before, today, false, false, 'duplicate');
      var mode = MODES.indexOf(config.mode) >= 0 ? config.mode : (MODES.indexOf(result.mode) >= 0 ? result.mode : 'sprint');
      var difficulty = DIFFICULTIES.indexOf(config.difficulty) >= 0 ? config.difficulty : (DIFFICULTIES.indexOf(result.difficulty) >= 0 ? result.difficulty : 'easy');
      var accuracy = number(result.accuracy, 0, 0, 100), elapsed = number(result.elapsed, 0, 0, 7200);
      var correctChars = integer(result.correctChars, 0, 0, 1000000);
      var calculatedXp = Math.round(correctChars / 3 * Math.pow(accuracy / 100, 2));
      var baseXp = integer(result.xp, calculatedXp, 0, Math.min(600, Math.max(20, Math.floor(elapsed * 3))));
      if (!correctChars) baseXp = 0;
      // A challenge retains the seed date of its passage when a round crosses midnight.
      // Practice days/history still use the local date on which the player finishes.
      var dailyDate = validDate(config.dailyDate) ? config.dailyDate : today;
      var existingDaily = state.dailyResults[dailyDate];
      var dailyFirst = mode === 'daily' && baseXp > 0 && !(existingDaily && existingDaily.bonusClaimed);
      var xpEarned = baseXp + (dailyFirst ? 40 : 0);
      var levelId = Number.isInteger(config.levelId) && config.levelId >= 1 && config.levelId <= 12 ? config.levelId : null;
      var entry = normalizeHistory({
        id: id, date: today, at: date.toISOString(), mode: mode, difficulty: difficulty, dailyDate: dailyDate,
        duration: number(config.duration, 0, 0, 7200), device: config.device,
        wpm: result.wpm, accuracy: accuracy, points: result.points, xp: xpEarned,
        elapsed: elapsed, correctChars: correctChars, attempts: result.attempts, errors: result.errors,
        bestCombo: result.bestCombo, perfectWords: result.perfectWords, missedWords: result.missedWords,
        levelId: levelId, reason: reason
      });
      state.history.unshift(entry);
      state.history = state.history.slice(0, MAX_HISTORY);
      state.recordedIds.push(id);
      state.recordedIds = state.recordedIds.slice(-MAX_RECORDED_IDS);
      state.xp = Math.min(1000000000, state.xp + xpEarned);
      state.days = Array.from(new Set(state.days.concat([today]))).sort().slice(-MAX_DAYS);
      entry.missedWords.forEach(function (word) { state.missedWords[word] = (own(state.missedWords, word) ? state.missedWords[word] : 0) + 1; });
      var sortedWords = Object.keys(state.missedWords).sort(function (a, b) { return state.missedWords[b] - state.missedWords[a]; }).slice(0, 100);
      var boundedWords = {};
      sortedWords.forEach(function (word) { boundedWords[word] = state.missedWords[word]; });
      state.missedWords = boundedWords;
      var completedLesson = false;
      if (mode === 'lesson' && levelId !== null) {
        var lesson = state.lessons[levelId] || { completed: false, bestWpm: 0, bestAccuracy: 0, attempts: 0, completedAt: null };
        var passed = config.completed === true && reason === 'complete' &&
          typeof config.targetWpm === 'number' && typeof config.targetAccuracy === 'number' &&
          entry.wpm >= config.targetWpm && entry.accuracy >= config.targetAccuracy;
        completedLesson = passed && !lesson.completed;
        lesson.completed = lesson.completed || passed;
        lesson.bestWpm = Math.max(lesson.bestWpm, entry.wpm);
        lesson.bestAccuracy = Math.max(lesson.bestAccuracy, entry.accuracy);
        lesson.attempts++;
        if (passed && !lesson.completedAt) lesson.completedAt = date.toISOString();
        state.lessons[levelId] = lesson;
      }
      if (mode === 'daily') {
        var daily = existingDaily || { attempts: 0, bestWpm: 0, bestAccuracy: 0, bestPoints: 0, bonusClaimed: false };
        daily.attempts++;
        daily.bestWpm = Math.max(daily.bestWpm, entry.wpm);
        daily.bestAccuracy = Math.max(daily.bestAccuracy, entry.accuracy);
        daily.bestPoints = Math.max(daily.bestPoints, entry.points);
        daily.bonusClaimed = daily.bonusClaimed || dailyFirst;
        state.dailyResults[dailyDate] = daily;
        Object.keys(state.dailyResults).sort().slice(0, -MAX_DAYS).forEach(function (day) { delete state.dailyResults[day]; });
      }
      persist();
      return response(true, xpEarned, before, today, completedLesson, dailyFirst);
    }
    function settings(partial) {
      refreshPersisted();
      state.settings = sanitizeSettings(partial, state.settings);
      persist();
      return clone(state.settings);
    }
    function exportData() { refreshPersisted(); return JSON.stringify(state, null, 2); }
    function importData(json) {
      try {
        if (typeof json !== 'string' || !json.length || json.length > MAX_IMPORT_BYTES) throw new Error('Choose a Pace progress JSON file smaller than 2 MB.');
        var imported = normalize(JSON.parse(json));
        state = imported;
        persist();
        return { ok: true, persisted: available, error: null, state: get() };
      } catch (error) { return { ok: false, error: error instanceof SyntaxError ? 'This file is not valid JSON.' : error.message, state: get() }; }
    }
    return {
      key: KEY, get: get, record: record, settings: settings, exportData: exportData, importData: importData,
      get available() { return available; }, get storageError() { return storageError; }
    };
  }
  return { createStore: createStore, key: KEY };
});
