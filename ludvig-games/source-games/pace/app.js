(function () {
  'use strict';
  const E = window.PaceEngine;
  const C = window.PaceContent;
  const store = window.PaceProgress.createStore();
  const $ = (id) => document.getElementById(id);
  const all = (selector) => Array.from(document.querySelectorAll(selector));
  const esc = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name, cls = '') => '<svg class="icon ' + cls + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const modes = {sprint:'Speed run', accuracy:'Accuracy', weakness:'Fix mistakes', daily:'Daily challenge', lesson:'Level'};
  const coarse = window.matchMedia('(pointer: coarse)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const input = $('typing-input');
  const trainer = $('trainer');
  let state = store.get();
  let settings = state.settings;
  let mode = ['sprint','accuracy','weakness'].includes(settings.mode) ? settings.mode : 'sprint';
  let difficulty = settings.difficulty;
  let duration = settings.duration;
  let lessonId = null;
  let page = 'practice';
  let run = null;
  let runConfig = null;
  let armed = false;
  let resultShown = false;
  let chars = [];
  let renderedValue = '';
  let passageOffset = 0;
  let today = E.dateKey(new Date());
  let daily = C.getDaily(today);
  let frame = 0;
  let toastTimer = 0;
  let feedbackTimer = 0;
  let composing = false;
  let pendingImport = null;
  let audioContext = null;
  let lastSoundAt = 0;
  let progressDevice = coarse.matches ? 'mobile' : 'desktop';
  let confettiFrame = 0;
  let lastBest = 0;

  function motions() { return settings.motion && !reducedMotion.matches; }
  function integer(n) { return Math.round(Number(n) || 0); }
  function pct(n) { return (Number(n) || 0).toFixed(1).replace('.0','') + '%'; }
  function number(n) { return integer(n).toLocaleString('en-US'); }
  function currentDevice() { return coarse.matches ? 'mobile' : 'desktop'; }
  function lesson() { return C.lessons.find(item => item.id === lessonId); }
  function sortedMistakes() { return Object.entries(state.missedWords).sort((a,b) => b[1] - a[1]).map(([word]) => word); }
  function bestForDevice(device) { return Math.max(0, ...state.history.filter(item => item.device === device).map(item => item.wpm)); }
  function refreshState() {
    state = store.get(); settings = state.settings;
    $('storage-warning').hidden = store.available && !store.storageError;
    if (!$('storage-warning').hidden) $('storage-warning').textContent = store.available ? 'The previous progress could not be read. You can import a backup in Settings.' : 'Progress cannot be saved in this browser. You can still play and export your progress in Settings.';
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3600);
  }
  function persistSettings(partial) {
    store.settings(partial);
    refreshState();
    applySettings();
  }
  function applySettings() {
    document.body.classList.toggle('motion-off', !settings.motion);
    $('setting-sound').checked = settings.sound;
    $('setting-motion').checked = settings.motion;
    $('sound-button').setAttribute('aria-pressed', String(settings.sound));
    $('sound-button').setAttribute('aria-label', settings.sound ? 'Turn sound off' : 'Turn sound on');
    $('sound-button').innerHTML = icon(settings.sound ? 'sound' : 'muted');
  }
  function initAudio() {
    if (!settings.sound) return;
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch (_) { /* Audio is optional. */ }
  }
  function tone(type) {
    if (!settings.sound || !audioContext) return;
    const t = audioContext.currentTime;
    if (type === 'key' && t - lastSoundAt < 0.035) return;
    lastSoundAt = t;
    const notes = type === 'finish' ? [440,554,659] : type === 'combo' ? [523,784] : type === 'error' ? [130] : [680];
    try {
      notes.forEach((frequency, i) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = t + i * 0.075;
        const length = type === 'key' ? 0.025 : 0.11;
        oscillator.type = type === 'error' ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(type === 'key' ? 0.025 : 0.05, start + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.001, start + length);
        oscillator.connect(gain); gain.connect(audioContext.destination);
        oscillator.start(start); oscillator.stop(start + length + 0.015);
      });
    } catch (_) { /* Keep typing even if audio is unavailable. */ }
  }
  function renderKeyboard() {
    const rows = ['qwertyuiop','asdfghjkl','zxcvbnm'];
    $('keyboard').innerHTML = rows.map(row => '<div class="keyboard-row">' + Array.from(row).map(key => '<span class="key" data-key="' + key + '">' + key.toUpperCase() + '</span>').join('') + '</div>').join('') + '<div class="keyboard-row"><span class="key space-key" data-key=" ">space</span></div>';
  }
  function updateKeyboard() {
    const cursor = armed && document.activeElement === input ? input.selectionStart : run?.value.length;
    const next = run && !run.finished ? run.text[cursor] : null;
    all('.key.active').forEach(key => key.classList.remove('active'));
    if (armed && next) {
      const key = all('.key').find(item => item.dataset.key === next.toLowerCase());
      if (key) key.classList.add('active');
    }
  }
  function updateDashboard() {
    refreshState();
    const nowKey = E.dateKey(new Date());
    if (nowKey !== today) { today = nowKey; daily = C.getDaily(today); }
    const level = E.getLevel(state.xp);
    $('header-level').textContent = level.level;
    $('profile-level').setAttribute('aria-label', 'Level ' + level.level + ', ' + number(state.xp) + ' XP. View your progress.');
    $('header-streak').textContent = E.getStreak(state.days,today);
    const completedToday = state.history.filter(item => item.date === today).length;
    $('daily-goal-number').textContent = Math.min(3,completedToday) + ' / 3';
    all('#goal-slots i').forEach((slot,index) => slot.classList.toggle('done', index < completedToday));
    $('daily-goal-caption').textContent = completedToday >= 3 ? 'Daily goal complete. Nicely done.' : 'Three short rounds. That’s your goal.';
    $('daily-title').textContent = daily.title;
    $('daily-description').textContent = daily.description;
    const dailyDone = state.dailyResults[today] && state.dailyResults[today].attempts > 0;
    $('daily-done').hidden = !dailyDone;
    $('daily-button').innerHTML = (dailyDone ? 'Beat your score' : 'Take the challenge') + icon('arrow');
    const next = C.lessons.find(item => !state.lessons[item.id]?.completed) || C.lessons[C.lessons.length - 1];
    $('next-level-number').textContent = String(next.id).padStart(2,'0');
    $('next-level-title').textContent = next.title;
    $('next-level-target').textContent = next.targetWpm + ' WPM · ' + next.targetAccuracy + '% accuracy';
    $('next-level-button').dataset.level = next.id;
    $('next-level-button').innerHTML = (C.lessons.every(item => state.lessons[item.id]?.completed) ? 'Replay level' : 'Start level') + icon('arrow');
    const best = bestForDevice(currentDevice());
    $('practice-best').textContent = best ? integer(best) : '—';
  }
  function buildPassage(text) {
    $('passage').textContent = '';
    const fragment = document.createDocumentFragment();
    chars = [];
    text.split(/( )/).forEach(part => {
      if (!part) return;
      const parent = part === ' ' ? fragment : document.createElement('span');
      if (part !== ' ') parent.className = 'word';
      for (const char of part) {
        const node = document.createElement('span');
        node.className = 'char' + (char === ' ' ? ' space' : '');
        node.textContent = char;
        chars.push(node);
        parent.appendChild(node);
      }
      if (parent !== fragment) fragment.appendChild(parent);
    });
    $('passage').appendChild(fragment);
    $('accessible-passage').textContent = 'Passage: ' + text;
    passageOffset = 0;
    $('passage').style.transform = 'translateY(0)';
    renderedValue = '';
  }
  function placeCaret() {
    if (!run || !chars.length || resultShown) return;
    const cursor = armed && document.activeElement === input ? input.selectionStart : run.value.length;
    const position = Math.min(cursor,chars.length - 1);
    const char = chars[position];
    if (!char) return;
    const lineHeight = parseFloat(getComputedStyle($('passage')).lineHeight) || 48;
    const unscrolledY = char.offsetTop;
    let nextOffset = Math.max(0,Math.floor(unscrolledY / lineHeight) * lineHeight - lineHeight);
    if (cursor === 0) nextOffset = 0;
    if (nextOffset !== passageOffset) {
      passageOffset = nextOffset;
      $('passage').style.transform = 'translateY(-' + passageOffset + 'px)';
    }
    const left = char.offsetLeft + (cursor >= chars.length ? char.offsetWidth : 0);
    $('typing-caret').style.left = Math.max(0,left - 1) + 'px';
    $('typing-caret').style.top = Math.max(0,unscrolledY - passageOffset + 1) + 'px';
  }
  function paintInput() {
    if (!run) return;
    const end = Math.max(run.value.length,renderedValue.length);
    let start = 0;
    while (start < Math.min(run.value.length,renderedValue.length) && run.value[start] === renderedValue[start]) start++;
    for (let i = start;i < end && i < chars.length;i++) {
      chars[i].classList.toggle('correct', i < run.value.length && run.value[i] === run.text[i]);
      chars[i].classList.toggle('wrong', i < run.value.length && run.value[i] !== run.text[i]);
    }
    renderedValue = run.value;
    placeCaret();
    updateKeyboard();
  }
  function prepareRound(options = {}) {
    cancelAnimationFrame(frame);
    if (run && !run.finished && run.startedAt !== null) E.finish(run,performance.now(),'quit');
    input.blur(); input.disabled = true; input.value = '';
    armed = false; resultShown = false; composing = false;
    document.body.classList.remove('typing-active');
    trainer.className = 'trainer is-ready';
    $('focus-cover').hidden = true;
    $('round-result').hidden = true; $('round-result').innerHTML = '';
    $('round-content').hidden = false;
    $('round-action').hidden = false; $('typing-instructions').hidden = false; $('active-message').hidden = true;
    $('typing-instructions').textContent = 'The clock starts with your first keystroke.';
    $('typing-caret').style.display = '';
    $('start-button').innerHTML = 'Start round ' + icon('arrow');
    const selectedLesson = lesson();
    const special = mode === 'daily' || mode === 'lesson';
    let text;
    let seconds;
    if (mode === 'daily') {
      daily = C.getDaily(E.dateKey(new Date()));
      text = daily.text; seconds = daily.duration;
    } else if (mode === 'lesson' && selectedLesson) {
      text = selectedLesson.text; seconds = null;
    } else {
      text = C.generateText({difficulty,mode,missedWords:options.missedWords || sortedMistakes().slice(0,8)});
      seconds = mode === 'sprint' ? duration : null;
    }
    const roundDifficulty = mode === 'daily' ? daily.difficulty : mode === 'lesson' ? selectedLesson.difficulty : difficulty;
    runConfig = {mode,difficulty:roundDifficulty,duration:seconds,levelId:mode === 'lesson' ? lessonId : null,dailyDate:mode === 'daily' ? E.dateKey(new Date()) : null,device:currentDevice(),runId:'pace-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10),targetWpm:selectedLesson?.targetWpm,targetAccuracy:selectedLesson?.targetAccuracy};
    run = E.createRun({...runConfig,text},performance.now());
    buildPassage(text);
    all('[data-mode]').forEach(button => { const chosen = button.dataset.mode === mode; button.classList.toggle('selected',chosen); button.setAttribute('aria-pressed',String(chosen)); });
    all('[data-difficulty]').forEach(button => { const chosen = button.dataset.difficulty === difficulty; button.classList.toggle('selected',chosen); button.setAttribute('aria-pressed',String(chosen)); button.disabled = false; });
    $('duration').disabled = false;
    document.querySelector('.difficulty-options').hidden = special;
    $('session-label').hidden = !special;
    $('session-label').textContent = mode === 'daily' ? 'Daily challenge · Medium' : selectedLesson ? 'Level ' + selectedLesson.id + ' · ' + selectedLesson.title : '';
    $('free-practice').hidden = !special;
    $('duration-control').hidden = mode !== 'sprint';
    $('untimed-label').hidden = special || mode === 'sprint';
    $('duration').value = String(duration);
    const descriptions = {easy:'Simple words. A steady rhythm.',medium:'Capitals, punctuation, and a little more flow.',hard:'Numbers, punctuation, and words that fight back.'};
    $('round-description').textContent = mode === 'lesson' ? selectedLesson.targetWpm + ' WPM · ' + selectedLesson.targetAccuracy + '% accuracy to pass' : mode === 'daily' ? 'Same passage today. +40 XP on your first finish.' : mode === 'weakness' ? (sortedMistakes().length ? 'A little extra practice for your tricky words.' : 'Common tricky words. Your own typos will appear here.') : descriptions[difficulty];
    updateLive(); updateKeyboard();
    requestAnimationFrame(placeCaret);
  }
  function startRound() {
    if (page !== 'practice' || armed || resultShown) return;
    initAudio();
    armed = true;
    trainer.classList.remove('is-ready'); trainer.classList.add('is-armed');
    $('round-action').hidden = true;
    $('typing-instructions').hidden = true;
    $('active-message').hidden = false;
    $('active-message').textContent = 'Ready when you are. Type the first character.';
    document.body.classList.add('typing-active');
    input.disabled = false;
    input.focus({preventScroll:true});
    input.setSelectionRange(input.value.length,input.value.length);
    $('focus-cover').hidden = true;
    requestAnimationFrame(() => { placeCaret(); updateKeyboard(); });
    frame = requestAnimationFrame(loop);
  }
  function loop() {
    if (!armed || resultShown) return;
    E.tick(run,performance.now());
    updateLive();
    if (run.finished) { showResult(); return; }
    frame = requestAnimationFrame(loop);
  }
  function updateLive() {
    if (!run) return;
    const stats = E.getStats(run,performance.now());
    const timed = run.duration !== null;
    const time = timed ? Math.ceil(stats.remaining) : Math.floor(stats.elapsed);
    $('live-time').innerHTML = (time >= 60 && !timed ? Math.floor(time/60) + ':' + String(time%60).padStart(2,'0') : time + '<span>s</span>');
    $('live-time').classList.toggle('urgent',timed && stats.remaining <= 10 && run.startedAt !== null);
    $('timer-label').textContent = timed ? 'remaining' : 'elapsed';
    $('live-wpm').textContent = integer(stats.wpm);
    $('live-accuracy').textContent = run.attempts ? pct(stats.accuracy) : '—';
    $('live-combo').innerHTML = stats.combo + '<span>×</span>';
    document.querySelector('.combo-stat').classList.toggle('charged',stats.combo >= 25);
    const fraction = timed ? stats.elapsed / run.duration : stats.progress;
    $('track-fill').style.width = Math.min(100,fraction*100) + '%';
    $('track-runner').style.left = Math.min(100,fraction*100) + '%';
  }
  function popFeedback(text,error) {
    if (!motions()) return;
    const node = document.createElement('span');
    node.className = 'floating-score' + (error ? ' error' : ''); node.textContent = text;
    $('feedback-layer').replaceChildren(node);
    setTimeout(() => node.remove(),950);
  }
  function handleInput(event) {
    if (!armed || run.finished || composing || event?.isComposing) return;
    const beforePoints = E.getStats(run,performance.now()).points;
    const response = E.applyInput(run,input.value,performance.now());
    if (input.value !== response.value) input.value = response.value;
    if (response.started) {
      trainer.classList.remove('is-armed'); trainer.classList.add('is-running','has-input');
      all('[data-difficulty]').forEach(button => { button.disabled = true; });
      $('duration').disabled = true;
      $('active-message').textContent = mode === 'accuracy' ? 'Accuracy first. Correct any red characters before finishing.' : 'Keep your rhythm. Backspace fixes a typo.';
    }
    if (response.wrong) {
      tone('error');
      if (motions()) { trainer.classList.remove('wrong-flash'); void trainer.offsetWidth; trainer.classList.add('wrong-flash'); }
      clearTimeout(feedbackTimer);
      $('active-message').textContent = 'Typo. Use Backspace to correct it.';
      feedbackTimer = setTimeout(() => { if (armed && !run.finished) $('active-message').textContent = 'Keep your rhythm. Backspace fixes a typo.'; },1600);
    } else if (response.comboMilestone) {
      tone('combo'); popFeedback(response.comboMilestone + ' key combo!');
      if (motions()) { trainer.classList.add('combo-flash'); setTimeout(() => trainer.classList.remove('combo-flash'),450); }
    } else if (response.completedWords) {
      tone('key');
      const earned = E.getStats(run,performance.now()).points - beforePoints;
      if (earned > 0) popFeedback('+' + earned);
    } else if (response.correct) tone('key');
    paintInput(); updateLive();
    if (run.value.length === run.text.length && mode === 'accuracy' && !run.finished) {
      $('active-message').textContent = 'One or more typos remain. Backspace to the red characters and correct them.';
    }
    if (run.finished) showResult();
  }
  function finishSummary(result,record) {
    if (!record.saved) return 'This round was too short to save. Practice for at least 5 seconds and type 10 characters.';
    if (result.accuracy < 85) return 'Slow down a little. Aim for 95% accuracy before chasing a faster time.';
    if (result.accuracy < 95) return 'You’re finding your rhythm. A slightly steadier pace can help those typos disappear.';
    if (result.errors === 0) return 'Clean from start to finish. Try a faster pace or step up the difficulty.';
    return 'A strong round. Keep this accuracy as you gradually build speed.';
  }
  function showResult() {
    if (resultShown || !run || !run.result) return;
    resultShown = true; armed = false;
    cancelAnimationFrame(frame); clearTimeout(feedbackTimer);
    const result = run.result;
    lastBest = bestForDevice(runConfig.device);
    const record = store.record(result,{...runConfig,completed:result.reason === 'complete'},new Date());
    refreshState(); updateDashboard();
    input.disabled = true; input.blur();
    document.body.classList.remove('typing-active');
    trainer.className = 'trainer is-complete';
    $('round-content').hidden = true; $('focus-cover').hidden = true;
    $('round-result').hidden = false;
    updateKeyboard();
    const personalBest = record.saved && result.wpm > lastBest && lastBest > 0;
    const leveledUp = record.saved && record.levelAfter.level > record.levelBefore.level;
    const selectedLesson = lesson();
    const passedThisRun = record.saved && mode === 'lesson' && selectedLesson && result.reason === 'complete' && result.wpm >= selectedLesson.targetWpm && result.accuracy >= selectedLesson.targetAccuracy;
    let heading = personalBest ? 'Your new best.' : passedThisRun ? 'Level complete.' : result.accuracy >= 98 && result.attempts > 10 ? 'That was smooth.' : 'Round complete.';
    let kicker = leveledUp ? 'LEVEL UP · YOU’RE LEVEL ' + record.levelAfter.level : personalBest ? 'PERSONAL BEST · ' + runConfig.device.toUpperCase() : 'ANOTHER STEP FORWARD';
    let lessonMessage = '';
    if (mode === 'lesson' && selectedLesson) {
      lessonMessage = passedThisRun ? '<div class="level-result">' + icon('check') + 'Level ' + selectedLesson.id + ' complete. ' + (selectedLesson.id < 12 ? 'The next level is unlocked.' : 'You’ve completed all 12 levels.') + '</div>' : '<div class="level-result failed">To pass: ' + selectedLesson.targetWpm + ' WPM and ' + selectedLesson.targetAccuracy + '% accuracy in the same round. Give it another go.</div>';
    }
    const missed = result.missedWords.slice(0,7);
    const hasNext = passedThisRun && selectedLesson.id < 12;
    $('round-result').innerHTML = '<div class="result-kicker">' + icon(leveledUp ? 'bolt' : 'check') + esc(kicker) + '</div><h2 tabindex="-1" id="result-heading">' + esc(heading) + '</h2><div class="result-stats"><div><strong>' + integer(result.wpm) + '</strong><span>words per minute</span></div><div><strong>' + integer(result.accuracy) + '<small>%</small></strong><span>accuracy</span></div><div class="xp-result"><strong>+' + record.xpEarned + '</strong><span>XP earned</span></div></div><div class="result-detail"><span>' + number(result.points) + ' points</span><span>' + result.errors + ' ' + (result.errors === 1 ? 'typo' : 'typos') + '</span><span>' + result.bestCombo + ' best combo</span><span>' + Math.round(result.elapsed) + ' sec</span></div>' + lessonMessage + '<p class="result-tip">' + esc(finishSummary(result,record)) + (record.dailyFirst ? ' +40 daily bonus XP included.' : '') + '</p>' + (missed.length ? '<div class="result-words" aria-label="Words to practice">' + missed.map(word => '<span>' + esc(word) + '</span>').join('') + '</div>' : '') + '<div class="result-actions"><button class="primary-button" id="next-round">' + (hasNext ? 'Next level' : mode === 'lesson' ? 'Try again' : 'Another round') + icon('arrow') + '</button>' + (missed.length ? '<button class="secondary-button" id="practice-missed">Practice these words</button>' : '<button class="secondary-button" id="result-progress">View progress</button>') + '</div>';
    $('next-round').addEventListener('click',() => {
      if (hasNext) lessonId = selectedLesson.id + 1;
      prepareRound(); startRound();
    });
    if ($('practice-missed')) $('practice-missed').addEventListener('click',() => {
      mode = 'weakness'; lessonId = null;
      persistSettings({mode}); prepareRound({missedWords:result.missedWords}); startRound();
    });
    if ($('result-progress')) $('result-progress').addEventListener('click',() => navigate('progress'));
    $('result-heading').focus({preventScroll:true});
    if (record.saved) { tone('finish'); celebrate(leveledUp || personalBest || record.completedLesson ? 80 : 32); }
    $('round-description').textContent = (record.saved ? record.persisted ? 'Saved · ' : 'Saved in this tab only · ' : '') + (runConfig.device === 'mobile' ? 'Touch keyboard' : 'Physical keyboard') + ' · ' + C.difficulties[runConfig.difficulty].label;
  }
  function celebrate(amount) {
    if (!motions()) return;
    const canvas = $('confetti'); const context = canvas.getContext('2d');
    if (!context) return;
    cancelAnimationFrame(confettiFrame);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = w; canvas.height = h;
    const colors = ['#a8cb72','#385f32','#e2bc6c','#d0e6ac','#8aa481'];
    const particles = Array.from({length:amount},() => ({x:w/2+(Math.random()-.5)*150,y:h*.38,vx:(Math.random()-.5)*8,vy:-Math.random()*7-2,rotation:Math.random()*6,size:3+Math.random()*4,color:colors[Math.floor(Math.random()*colors.length)]}));
    const start = performance.now();
    function animate(now) {
      context.clearRect(0,0,w,h);
      const alpha = Math.min(1,(1600-(now-start))/500);
      if (alpha <= 0) return;
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += .12; p.rotation += .06;
        context.save(); context.globalAlpha = alpha; context.translate(p.x,p.y); context.rotate(p.rotation); context.fillStyle = p.color; context.fillRect(-p.size/2,-p.size/2,p.size,p.size*.55); context.restore();
      });
      confettiFrame = requestAnimationFrame(animate);
    }
    confettiFrame = requestAnimationFrame(animate);
  }
  function renderLevels() {
    const completed = C.lessons.filter(item => state.lessons[item.id]?.completed).length;
    $('levels-completed').textContent = completed;
    $('level-list').innerHTML = C.lessons.map(item => {
      const record = state.lessons[item.id];
      const done = record?.completed;
      const unlocked = item.id === 1 || !!state.lessons[item.id-1]?.completed;
      return '<article class="level-row ' + (done ? 'done' : !unlocked ? 'locked' : '') + '"><span class="level-number">' + (done ? icon('check') : String(item.id).padStart(2,'0')) + '</span><div><h3>' + esc(item.title) + '</h3><p>' + item.targetWpm + ' WPM · ' + item.targetAccuracy + '% accuracy</p><span class="level-detail">' + esc(C.difficulties[item.difficulty].label) + (done ? ' · Completed' : !unlocked ? ' · Finish level ' + (item.id - 1) + ' to unlock' : ' · Ready to play') + '</span></div>' + (unlocked ? '<button class="text-button" data-start-level="' + item.id + '">' + (done ? 'Replay' : 'Start') + icon('arrow') + '</button>' : icon('lock','level-lock')) + '</article>';
    }).join('');
    all('[data-start-level]').forEach(button => button.addEventListener('click',() => startLesson(Number(button.dataset.startLevel))));
  }
  function startLesson(id) {
    if (id > 1 && !state.lessons[id-1]?.completed) { toast('Finish the previous level to unlock this one.'); return; }
    mode = 'lesson'; lessonId = id;
    navigate('practice',true); prepareRound();
    $('start-button').focus({preventScroll:true});
  }
  function chart(history) {
    if (!history.length) return '<div class="empty-chart">' + icon('bolt') + '<strong>Your first round starts the story.</strong><p>Complete a round to see your pace here.</p><button class="text-button" data-chart-practice>Start practicing ' + icon('arrow') + '</button></div>';
    const data = history.slice(0,12).reverse();
    const maximum = Math.max(40,Math.ceil(Math.max(...data.map(x=>x.wpm))/20)*20);
    const left = 30, right = 590, top = 14, bottom = 160;
    const step = data.length > 1 ? (right-left)/(data.length-1) : 0;
    const coords = data.map((item,index) => ({x:data.length===1 ? (left+right)/2 : left+step*index,y:bottom-(item.wpm/maximum)*(bottom-top),item}));
    const points = coords.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
    const area = coords.length>1 ? '<path d="M ' + coords[0].x + ' ' + bottom + ' L ' + coords.map(p=>p.x+' '+p.y).join(' L ') + ' L ' + coords[coords.length-1].x + ' '+bottom+' Z" fill="#e8f0db"/>' : '';
    return '<svg class="speed-chart" viewBox="0 0 610 190" role="img" aria-label="Words per minute in the last ' + data.length + ' rounds, from ' + integer(data[0].wpm) + ' to ' + integer(data[data.length-1].wpm) + '.">' + [0,.5,1].map(f=>'<line class="chart-grid" x1="30" x2="600" y1="'+(bottom-f*(bottom-top))+'" y2="'+(bottom-f*(bottom-top))+'"/><text class="chart-label" x="0" y="'+(bottom-f*(bottom-top)+4)+'">'+integer(maximum*f)+'</text>').join('') + area + '<polyline points="' + points + '" fill="none" stroke="#668a3f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' + coords.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="4" fill="#f7f8f4" stroke="#668a3f" stroke-width="2"><title>'+integer(p.item.wpm)+' WPM · '+pct(p.item.accuracy)+' · '+esc(p.item.date)+'</title></circle>').join('') + '<text class="chart-label" x="30" y="185">Earlier rounds</text><text class="chart-label" text-anchor="end" x="592" y="185">Latest round</text></svg>';
  }
  function renderProgress() {
    refreshState();
    const history = state.history.filter(item => item.device === progressDevice);
    const level = E.getLevel(state.xp);
    const totalAttempts = history.reduce((sum,item)=>sum+item.attempts,0);
    const totalErrors = history.reduce((sum,item)=>sum+item.errors,0);
    const accuracy = totalAttempts ? (1-totalErrors/totalAttempts)*100 : 0;
    const best = bestForDevice(progressDevice);
    const words = sortedMistakes().slice(0,8);
    const days = new Set(state.days);
    let week = '';
    for (let i=6;i>=0;i--) {
      const key = E.shiftDateKey(today,-i);
      const date = new Date(key+'T12:00:00');
      week += '<div class="week-day ' + (days.has(key)?'done ':'') + (key===today?'today':'') + '" aria-label="' + esc(date.toLocaleDateString('en-GB',{weekday:'long',month:'short',day:'numeric'})) + (days.has(key)?', practiced':', no practice') + '"><span>' + date.toLocaleDateString('en-GB',{weekday:'narrow'}) + '</span><i>' + (days.has(key)?icon('check'):date.getDate()) + '</i></div>';
    }
    const summary = '<div class="progress-summary"><div><span>Personal best · ' + (progressDevice==='mobile'?'touch':'physical') + '</span><strong>' + (best?integer(best):'—') + '<small>WPM</small></strong></div><div><span>Average accuracy</span><strong>' + (totalAttempts?pct(accuracy):'—') + '</strong></div><div><span>Daily streak</span><strong>' + E.getStreak(state.days,today) + '<small>' + (E.getStreak(state.days,today)===1?'day':'days') + '</small></strong></div><div><span>Completed rounds</span><strong>' + history.length + '</strong></div></div>';
    const rows = history.slice(0,15).map(item => {
      const date = new Date(item.at);
      const dateText = item.date===today ? 'Today' : date.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
      return '<tr><td>' + esc(modes[item.mode]||'Practice') + '<small>' + esc(C.difficulties[item.difficulty]?.label||'Easy') + (item.duration ? ' · '+item.duration+' sec' : '') + '</small></td><td>' + integer(item.wpm) + '</td><td>' + pct(item.accuracy) + '</td><td class="hide-mobile">' + item.errors + '</td><td class="xp-cell">+' + item.xp + '</td><td>' + dateText + '<small>' + date.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) + '</small></td></tr>';
    }).join('');
    $('progress-content').innerHTML = '<div class="section-heading"><span>Typing records</span><select id="progress-device" aria-label="Keyboard type"><option value="desktop"' + (progressDevice==='desktop'?' selected':'') + '>Physical keyboard</option><option value="mobile"' + (progressDevice==='mobile'?' selected':'') + '>Touch keyboard</option></select></div>' + summary + '<div class="progress-columns"><div><section class="progress-section"><div class="section-heading"><h2>Your pace over time</h2><span>Last 12 rounds</span></div>' + chart(history) + '<p class="chart-caption">Rounds can use different difficulties and lengths. Check the history below when comparing results.</p></section><div class="xp-banner"><span class="xp-badge">' + level.level + '</span><div class="xp-details"><div class="xp-title"><strong>' + esc(level.title) + '</strong><span>' + number(state.xp) + ' XP</span></div><div class="xp-track"><i style="width:' + level.progress*100 + '%"></i></div><p>' + (level.xpForNextLevel-level.xpIntoLevel) + ' XP to level ' + (level.level+1) + '</p></div></div></div><div class="progress-secondary"><section class="progress-section"><div class="section-heading"><h2>Keep showing up</h2><span>Last 7 days</span></div><div class="week-row">' + week + '</div></section><section class="progress-section"><h2>Your tricky words</h2>' + (words.length ? '<div class="weak-words">'+words.map(word=>'<span class="weak-word">'+esc(word)+'</span>').join('')+'</div><button id="progress-mistakes" class="text-button">Practice these words '+icon('arrow')+'</button>' : '<p class="weak-empty">When you miss a word, it appears here. Your next practice can target those exact words.</p>') + '</section></div></div><section class="progress-section history-section"><div class="section-heading"><h2>Recent rounds</h2><span>Latest ' + Math.min(15,history.length) + '</span></div>' + (history.length ? '<table class="history-table"><thead><tr><th>Practice</th><th>WPM</th><th>Accuracy</th><th class="hide-mobile">Typos</th><th>XP</th><th>Date</th></tr></thead><tbody>'+rows+'</tbody></table>' : '<p class="history-empty">No rounds on this keyboard type yet. Time to change that.</p>') + '</section>';
    $('progress-device').addEventListener('change',event => { progressDevice = event.target.value; renderProgress(); });
    const practice = document.querySelector('[data-chart-practice]');
    if (practice) practice.addEventListener('click',()=>navigate('practice'));
    if ($('progress-mistakes')) $('progress-mistakes').addEventListener('click',()=>{mode='weakness';lessonId=null;persistSettings({mode});navigate('practice',true);prepareRound();});
  }
  function navigate(destination,preserveRound = false) {
    if (!['practice','levels','progress'].includes(destination)) destination = 'practice';
    if (destination === page && !preserveRound) {
      if(page === 'levels') renderLevels();
      if(page === 'progress') renderProgress();
      return;
    }
    const wasPlaying = armed;
    if (wasPlaying && destination !== page) prepareRound();
    page = destination;
    ['practice','levels','progress'].forEach(name => { $('page-'+name).hidden = name!==page; });
    all('.nav-item').forEach(button => { const current=button.dataset.nav===page; button.classList.toggle('active',current); if(current) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
    try { history.replaceState(null,'','#'+page); } catch (_) { /* file:// browsers may restrict history. */ }
    updateDashboard();
    if (page==='levels') renderLevels();
    if (page==='progress') renderProgress();
    if (page==='practice' && !preserveRound && wasPlaying) prepareRound();
    else if (page==='practice') requestAnimationFrame(placeCaret);
  }
  function openDialog(id) {
    if (armed) { input.blur(); $('focus-cover').hidden = false; }
    $(id).showModal();
  }
  function exportProgress() {
    const blob = new Blob([store.exportData()],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download='pace-progress-'+E.dateKey(new Date())+'.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
    toast('Progress exported. Keep this file as your backup.');
  }
  all('[data-nav]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();navigate(button.dataset.nav);}));
  all('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;lessonId=null;persistSettings({mode});prepareRound();}));
  all('[data-difficulty]').forEach(button=>button.addEventListener('click',()=>{difficulty=button.dataset.difficulty;persistSettings({difficulty});prepareRound();}));
  $('duration').addEventListener('change',event=>{duration=Number(event.target.value);persistSettings({duration});prepareRound();});
  $('start-button').addEventListener('click',startRound);
  $('restart-button').addEventListener('click',()=>{prepareRound();$('start-button').focus({preventScroll:true});});
  $('free-practice').addEventListener('click',()=>{mode='sprint';lessonId=null;prepareRound();});
  $('daily-button').addEventListener('click',()=>{mode='daily';lessonId=null;prepareRound();$('start-button').focus({preventScroll:true});});
  $('next-level-button').addEventListener('click',()=>startLesson(Number($('next-level-button').dataset.level)));
  $('typing-area').addEventListener('click',()=>{if(armed&&!run.finished)input.focus({preventScroll:true});});
  $('focus-button').addEventListener('click',()=>input.focus({preventScroll:true}));
  input.addEventListener('focus',()=>{$('focus-cover').hidden=true;placeCaret();});
  input.addEventListener('blur',()=>{if(armed&&!run.finished){$('focus-cover').hidden=false;$('focus-cover').querySelector('span').textContent=run.startedAt===null?'The clock starts with your first keystroke.':'The clock is still running.';}});
  input.addEventListener('input',handleInput);
  input.addEventListener('select',()=>{if(armed){placeCaret();updateKeyboard();}});
  input.addEventListener('keyup',event=>{if(armed&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){placeCaret();updateKeyboard();}});
  input.addEventListener('compositionstart',()=>{composing=true;});
  input.addEventListener('compositionend',()=>{composing=false;handleInput();});
  input.addEventListener('beforeinput',event=>{
    if (['insertFromPaste','insertFromDrop','insertReplacementText'].includes(event.inputType)) { event.preventDefault(); toast('Type each character yourself. Pasting and suggestions do not count.'); }
    if(event.inputType==='insertLineBreak'||event.inputType==='insertParagraph')event.preventDefault();
  });
  input.addEventListener('paste',event=>{event.preventDefault();toast('No paste shortcuts. You’ve got this.');});
  input.addEventListener('drop',event=>event.preventDefault());
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();prepareRound();$('start-button').focus({preventScroll:true});return;}
    if(event.key==='Enter'&&!event.isComposing)event.preventDefault();
    const key=all('.key').find(item=>item.dataset.key===event.key.toLowerCase());
    if(key){key.classList.add('pressed');setTimeout(()=>key.classList.remove('pressed'),95);}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!armed&&!resultShown&&page==='practice'&&!document.querySelector('dialog[open]')&&!['BUTTON','SELECT','INPUT','TEXTAREA','A'].includes(document.activeElement.tagName)){event.preventDefault();startRound();}
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden){updateDashboard();if(armed){E.tick(run,performance.now());if(run.finished)showResult();}}
  });
  window.addEventListener('resize',()=>requestAnimationFrame(placeCaret));
  window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
  window.addEventListener('storage',event=>{if(event.key===store.key){toast('Progress changed in another tab. Reload this tab to see the latest results.');}});
  $('sound-button').addEventListener('click',()=>{persistSettings({sound:!settings.sound});initAudio();tone('key');});
  $('settings-button').addEventListener('click',()=>openDialog('settings-dialog'));
  $('setting-sound').addEventListener('change',event=>{persistSettings({sound:event.target.checked});initAudio();tone('key');});
  $('setting-motion').addEventListener('change',event=>persistSettings({motion:event.target.checked}));
  ['help-button','footer-help'].forEach(id=>$(id).addEventListener('click',()=>openDialog('help-dialog')));
  ['export-button','settings-export'].forEach(id=>$(id).addEventListener('click',exportProgress));
  $('import-button').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    event.target.value='';$('import-status').textContent='';$('import-confirm').hidden=true;pendingImport=null;
    if(file.size>2*1024*1024){$('import-status').textContent='That file is too large. Choose a Pace progress JSON file.';return;}
    try {
      const text=await file.text();
      const validator=window.PaceProgress.createStore({getItem:()=>null,setItem:()=>{}});
      const checked=validator.importData(text);
      if(!checked.ok)throw new Error(checked.error||'Invalid progress file.');
      pendingImport=text;
      $('import-status').textContent='Ready to import '+checked.state.history.length+' rounds and '+number(checked.state.xp)+' XP.';
      $('import-confirm').hidden=false;
    } catch(error){$('import-status').textContent=error.message||'Could not read that progress file.';}
  });
  $('cancel-import').addEventListener('click',()=>{pendingImport=null;$('import-confirm').hidden=true;$('import-status').textContent='Import cancelled.';});
  $('confirm-import').addEventListener('click',()=>{
    if(!pendingImport)return;
    const result=store.importData(pendingImport);
    $('import-status').textContent=result.ok?'Progress imported.':result.error;
    if(result.ok){pendingImport=null;$('import-confirm').hidden=true;refreshState();applySettings();difficulty=settings.difficulty;duration=settings.duration;mode=['sprint','accuracy','weakness'].includes(settings.mode)?settings.mode:'sprint';lessonId=null;prepareRound();updateDashboard();if(page==='progress')renderProgress();if(page==='levels')renderLevels();}
  });
  all('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
  renderKeyboard();applySettings();updateDashboard();prepareRound();navigate(location.hash.slice(1)||'practice');
})();
