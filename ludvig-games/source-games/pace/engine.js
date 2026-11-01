(function (root, factory) {
  'use strict';
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  if (root) root.PaceEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TIMED_MODES = new Set(['sprint', 'daily']);
  const SCORE_PER_CHARACTER = 5;
  const COMBO_STEP = 25;
  let nextRunId = 0;

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clock(now) {
    return Math.max(0, finiteNumber(now, 0));
  }

  function canonicalWord(value) {
    return value.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').toLowerCase();
  }

  function tokenize(text) {
    return Array.from(text.matchAll(/\S+/g), function (match, index) {
      return { index, start: match.index, end: match.index + match[0].length, text: match[0], word: canonicalWord(match[0]) };
    });
  }

  function createRun(config, now) {
    config = config || {};
    const text = String(config.text || '');
    const mode = config.mode || 'sprint';
    let duration = null;
    if (mode !== 'accuracy') {
      if (config.duration === undefined) duration = TIMED_MODES.has(mode) ? 60 : null;
      else if (config.duration !== null && finiteNumber(config.duration, 0) > 0) duration = finiteNumber(config.duration, 60);
    }
    const runId = config.runId || ('pace-' + Date.now().toString(36) + '-' + (++nextRunId).toString(36));
    return {
      id: runId,
      runId,
      text,
      value: '',
      duration,
      mode,
      difficulty: config.difficulty || 'easy',
      levelId: config.levelId === undefined ? null : config.levelId,
      createdAt: clock(now),
      startedAt: null,
      endedAt: null,
      elapsed: 0,
      remaining: duration,
      finished: false,
      result: null,
      attempts: 0,
      errors: 0,
      correctAttempts: 0,
      combo: 0,
      bestCombo: 0,
      words: tokenize(text),
      _rewardedPositions: new Set(),
      _completedWords: new Set(),
      _perfectWords: new Set(),
      _wordErrors: new Map(),
      _letterErrors: Object.create(null),
      _awardedCombos: new Set()
    };
  }

  function elapsedAt(run, now) {
    if (run.startedAt === null) return 0;
    const end = run.endedAt === null ? clock(now) : run.endedAt;
    const elapsed = Math.max(0, (end - run.startedAt) / 1000);
    return run.duration === null ? elapsed : Math.min(run.duration, elapsed);
  }

  function wordAt(run, position) {
    for (let index = 0; index < run.words.length; index += 1) {
      const word = run.words[index];
      if (position < word.end) return word;
      const next = run.words[index + 1];
      if (!next || position < next.start) return word;
    }
    return null;
  }

  function addError(run, position) {
    const word = wordAt(run, position);
    if (word) {
      run._wordErrors.set(word.index, (run._wordErrors.get(word.index) || 0) + 1);
      run._perfectWords.delete(word.index);
    }
    const expected = run.text[position];
    if (expected && !/\s/.test(expected)) {
      const letter = expected.toLowerCase();
      run._letterErrors[letter] = (run._letterErrors[letter] || 0) + 1;
    }
  }

  function completedWords(run) {
    let newlyCompleted = 0;
    for (const word of run.words) {
      if (run._completedWords.has(word.index)) continue;
      const boundary = word.end === run.text.length ? word.end : word.end + 1;
      if (run.value.length < boundary) continue;
      if (run.value.slice(word.start, boundary) !== run.text.slice(word.start, boundary)) continue;
      run._completedWords.add(word.index);
      if (!run._wordErrors.has(word.index)) run._perfectWords.add(word.index);
      newlyCompleted += 1;
    }
    return newlyCompleted;
  }

  function aggregateWordErrors(run) {
    const aggregate = new Map();
    for (const [index, count] of run._wordErrors) {
      const word = run.words[index].word;
      if (word) aggregate.set(word, (aggregate.get(word) || 0) + count);
    }
    return Array.from(aggregate, function (entry) { return { word: entry[0], count: entry[1] }; })
      .sort(function (a, b) { return b.count - a.count || a.word.localeCompare(b.word); });
  }

  function getStats(run, now) {
    const elapsed = elapsedAt(run, now);
    let correctChars = 0;
    for (let index = 0; index < run.value.length; index += 1) {
      if (run.value[index] === run.text[index]) correctChars += 1;
    }
    const wordErrors = aggregateWordErrors(run);
    const points = Math.max(0,
      run._rewardedPositions.size * SCORE_PER_CHARACTER +
      run._perfectWords.size * 20 +
      run._awardedCombos.size * 25 - run.errors * 2
    );
    const accuracy = run.attempts ? (run.correctAttempts / run.attempts) * 100 : 100;
    const remaining = run.duration === null ? null : Math.max(0, run.duration - elapsed);
    run.elapsed = elapsed;
    run.remaining = remaining;
    return {
      elapsed,
      remaining,
      wpm: elapsed >= 0.5 ? (correctChars / 5) / (elapsed / 60) : 0,
      accuracy,
      points,
      combo: run.combo,
      bestCombo: run.bestCombo,
      errors: run.errors,
      attempts: run.attempts,
      correctAttempts: run.correctAttempts,
      correctChars,
      uniqueCorrectChars: run._rewardedPositions.size,
      perfectWords: run._perfectWords.size,
      completedWords: run._completedWords.size,
      missedWords: wordErrors.map(function (item) { return item.word; }),
      wordErrors,
      letterErrors: Object.assign({}, run._letterErrors),
      progress: run.text.length ? Math.min(1, run.value.length / run.text.length) : 0,
      finished: run.finished
    };
  }

  function finish(run, now, reason) {
    if (run.result) return run.result;
    reason = reason || 'time';
    run.endedAt = clock(now);
    if (run.startedAt !== null && run.duration !== null) {
      run.endedAt = Math.min(run.endedAt, run.startedAt + run.duration * 1000);
    }
    run.finished = true;
    const stats = getStats(run, now);
    const earned = reason === 'complete' || reason === 'time';
    const completed = reason === 'complete';
    const xp = earned && run.attempts > 0
      ? Math.floor(run._rewardedPositions.size / 5) + run._completedWords.size * 3 +
        (completed ? 20 : 0) + (completed && run.errors === 0 ? 10 : 0)
      : 0;
    run.result = Object.assign({}, stats, {
      id: run.id,
      runId: run.runId,
      mode: run.mode,
      difficulty: run.difficulty,
      levelId: run.levelId,
      duration: run.duration,
      textLength: run.text.length,
      xp,
      reason,
      completed,
      finished: true
    });
    return run.result;
  }

  function tick(run, now) {
    if (!run.finished && run.startedAt !== null && run.duration !== null &&
        clock(now) - run.startedAt >= run.duration * 1000) {
      finish(run, run.startedAt + run.duration * 1000, 'time');
    }
    return run.result || getStats(run, now);
  }

  function applyInput(run, newText, now) {
    const response = {
      wrong: 0, correct: 0, completedWords: 0, comboMilestone: null,
      started: false, finished: run.finished, accepted: false, value: run.value
    };
    tick(run, now);
    if (run.finished) {
      response.finished = true;
      return response;
    }

    // Only printable text belongs in a typing passage. Tabs remain navigation keys.
    const next = String(newText === undefined || newText === null ? '' : newText)
      .replace(/[\u0000-\u001f\u007f]/g, '').slice(0, run.text.length);
    const previous = run.value;
    if (next === previous) {
      response.accepted = true;
      return response;
    }

    let prefix = 0;
    while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < previous.length - prefix && suffix < next.length - prefix &&
      previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1;
    const oldEnd = previous.length - suffix;
    const newEnd = next.length - suffix;

    if (newEnd > prefix && run.startedAt === null) {
      run.startedAt = clock(now);
      response.started = true;
    }
    if (oldEnd > prefix) run.combo = 0;

    for (let index = prefix; index < newEnd; index += 1) {
      run.attempts += 1;
      if (next[index] === run.text[index]) {
        run.correctAttempts += 1;
        response.correct += 1;
        run.combo += 1;
        run.bestCombo = Math.max(run.bestCombo, run.combo);
        const newPosition = !run._rewardedPositions.has(index);
        run._rewardedPositions.add(index);
        if (newPosition && run.combo % COMBO_STEP === 0 && !run._awardedCombos.has(run.combo)) {
          run._awardedCombos.add(run.combo);
          response.comboMilestone = run.combo;
        }
      } else {
        run.errors += 1;
        response.wrong += 1;
        run.combo = 0;
        addError(run, index);
      }
    }
    run.value = next;
    response.completedWords = completedWords(run);
    response.accepted = true;
    response.value = next;
    if (run.text.length > 0 && next.length === run.text.length &&
        (run.mode !== 'accuracy' || next === run.text)) {
      finish(run, now, 'complete');
    }
    response.finished = run.finished;
    getStats(run, now);
    return response;
  }

  function dateKey(date) {
    date = date || new Date();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new RangeError('Invalid date');
    return String(date.getFullYear()).padStart(4, '0') + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function parseDateKey(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const date = new Date(key + 'T12:00:00.000Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== key) return null;
    return date;
  }

  function shiftDateKey(key, days) {
    const date = parseDateKey(key);
    if (!date) throw new RangeError('Invalid date key');
    date.setUTCDate(date.getUTCDate() + Math.trunc(finiteNumber(days, 0)));
    return date.toISOString().slice(0, 10);
  }

  function getStreak(dayKeys, todayKey) {
    todayKey = todayKey || dateKey();
    if (!parseDateKey(todayKey)) return 0;
    const days = new Set(Array.from(dayKeys || []).filter(function (key) { return !!parseDateKey(key); }));
    let cursor = days.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
    let streak = 0;
    while (days.has(cursor)) {
      streak += 1;
      cursor = shiftDateKey(cursor, -1);
    }
    return streak;
  }

  function getLevel(xp) {
    xp = Math.max(0, Math.floor(finiteNumber(xp, 0)));
    const level = Math.floor(xp / 250) + 1;
    const xpIntoLevel = xp % 250;
    let title = 'Newcomer';
    if (level >= 30) title = 'Keyboard legend';
    else if (level >= 20) title = 'Speedster';
    else if (level >= 12) title = 'Flow state';
    else if (level >= 8) title = 'Quick thinker';
    else if (level >= 5) title = 'Focused';
    else if (level >= 3) title = 'In rhythm';
    else if (level >= 2) title = 'Apprentice';
    return { level, xpIntoLevel, xpForNextLevel: 250, progress: xpIntoLevel / 250, title };
  }

  return { createRun, applyInput, tick, finish, getStats, dateKey, shiftDateKey, getStreak, getLevel };
});
