# Pace

A small English typing game for desktop and mobile browsers. Copy short passages, improve accuracy, build speed, and keep a daily practice habit. The interface, instructions, lessons, and practice text are in English.

## Open the download

1. Extract `Pace.zip`.
2. Open `Pace/index.html` in a browser.
3. Choose a difficulty and press **Start round**.

The downloaded `index.html` contains its styles, scripts, and icon. It needs no installation, account, external libraries, or internet connection to play. The `source` folder includes the editable application and tests.

Browsers handle saving progress from a local file differently. If Pace shows a storage warning, export your progress before closing it, or serve the source over a local web server as described below. The hosted app and a downloaded copy have separate browser storage.

On a phone, open the hosted app in your browser and tap **Start round** to open the keyboard. A physical keyboard is the useful choice when your goal is faster computer typing. Touch practice uses a different input method.

## Practice modes

| Mode | What happens |
| --- | --- |
| **Speed run** | Type for 30, 60, or 120 seconds. The timer begins when you enter the first character. |
| **Accuracy** | Complete a short passage with no incorrect characters remaining. There is no time limit, but elapsed time still determines WPM. |
| **Fix mistakes** | Practice words you mistyped in previous completed rounds. New profiles start with common tricky words. |
| **Daily challenge** | A deterministic Medium passage for the current local date, with a 60-second timer. The first eligible finish earns a 40 XP daily bonus. Replays use the same passage for that date. |
| **Levels** | Complete 12 ordered lessons. Meet the speed and accuracy targets in the same attempt to unlock the next lesson. Completed lessons can be replayed. |

Free practice always offers every difficulty. Levels progress from 12 WPM and 85% accuracy to 65 WPM and 98% accuracy.

- **Easy:** familiar lowercase words, without punctuation.
- **Medium:** natural sentences, capitals, commas, and full stops.
- **Hard:** more complex words, punctuation, quotes, numbers, and times.

Practice text uses plain ASCII punctuation. The passage must be copied exactly, including spaces, capitalization, and punctuation. These are typing and word-familiarity drills: the app shows the correct spelling rather than testing whether you can recall a spelling without a prompt.

## Controls

| Action | Control |
| --- | --- |
| Start a prepared round | Click or tap **Start round**. On desktop, **Enter** also starts when focus is not on another interactive control. |
| Type | Enter the visible passage. The timer waits for the first typed character. |
| Correct a typo | **Backspace**. Normal text-cursor keys can move within the entered text. |
| Return after losing focus | Click the typing area or **Continue typing**. |
| Restart | Use the restart icon. **Escape** also resets a round while the typing input has focus. |
| Move between controls | **Tab** and **Shift+Tab**; the game does not treat Tab as passage text. |
| Sound | Use the sound button or **Settings**. Sound is off initially. |
| Motion | Turn **Motion & effects** off in Settings. The app also respects the browser's reduced-motion preference. |

The clock continues while a timed round loses focus, while a dialog is open, or while you switch tabs. There is no pause advantage. Restarting a round or leaving its practice screen discards the unfinished attempt.

Pasting and dropping text into a round are blocked. The app requests that autocorrect, automatic capitalization, spelling checks, and suggestions stay off, and rejects replacement suggestions where the browser identifies them. Mobile keyboards can still behave differently; this is a personal practice tool, not an anti-cheat system.

## Results, points, and XP

**Words per minute (WPM)** uses five correct characters as one word:

```text
WPM = (correct characters currently entered / 5) / elapsed minutes
```

Correct spaces and punctuation count. Incorrect characters do not contribute to WPM. The app keeps the calculation finite before enough time has elapsed and rounds displayed results.

**Accuracy** is correct character attempts divided by all character attempts. Correcting a mistake does not erase its earlier error. Deleting text alone does not add a new character attempt. Retyping characters creates new attempts, but it does not repeatedly award the same position's character points.

**Combo** counts consecutive correct character attempts. A typo or an edit breaks the streak of keystrokes. Combo milestones and completed words produce visual feedback. Errors are also marked in the passage.

**Points** reward correct progress, cleanly completed words, and new combo milestones. Errors reduce the score, which cannot fall below zero. **XP** is awarded after an eligible finish for correct typing and completed words, with completion and clean-finish bonuses. Every 250 accumulated XP advances the player level. Player XP levels are separate from the 12 guided lessons.

## Daily practice and streaks

- The daily goal is **three completed rounds**.
- A result must include at least **10 typed character attempts** and **5 seconds** of practice to count toward saved activity and rewards.
- An unfinished, restarted, or abandoned round does not count.
- One qualifying round is enough to maintain a daily streak; the three-round goal is a separate target.
- Dates, the daily challenge, and streaks follow the browser's **local calendar date**, not a fixed server timezone.
- A streak from yesterday remains current while you still have today to practice. Missing a full day breaks it.

A daily challenge stays associated with the date on which its round was prepared, including when it finishes after midnight. The activity itself is recorded on the finish date.

## Progress and device categories

Pace stores progress in this browser's `localStorage`, under `pace.progress.v1`. It has no account, database, or automatic cross-device synchronization. Clearing site data, changing browser profiles, or moving to another origin can give you a separate profile.

Progress includes cumulative XP, lesson completion, practice dates, recent rounds, settings, daily results, and frequently missed words. History retains the latest 200 rounds; date-based activity retains up to 370 days. Export a backup if you want to keep a separate copy.

The Progress screen separates **Physical keyboard** and **Touch keyboard** records. This classification uses the browser's `pointer: coarse` capability: coarse-pointer devices are labeled touch, and other devices are labeled physical. It is a device heuristic, not direct keyboard detection. An external keyboard on a tablet can therefore remain in the touch category. Both categories share the profile's XP, lessons, and daily streak.

Graphs compare your latest sessions, which can have different difficulties and durations. Check the history when deciding whether two scores are comparable.

### Move progress to another browser or device

1. Open **Settings → Export progress** or use **Export progress** on the Progress screen.
2. Transfer the resulting JSON file to the other device.
3. Open **Settings → Import progress** and choose the file.
4. Review the prompt and confirm **Replace progress**.

Import replaces the destination profile; it does not merge two profiles. Files are validated before replacement and must be smaller than 2 MB. If browser storage is unavailable, the active tab still keeps your progress in memory and allows export.

## Run the editable source

The app uses ordinary HTML, CSS, and JavaScript. There is no package installation or build step.

From the project root, or from `Pace/source` in the ZIP:

```sh
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080` in your browser. You can also publish the contents of `dist` with a static web host. The hosted version includes a web app manifest, but does not install a service-worker offline cache. The standalone download can run offline because its assets are embedded.

### Tests

Node.js 18 or later runs the engine and progress tests. No npm dependencies are required.

```sh
npm test
```

Equivalent command:

```sh
node tests/engine.test.mjs && node tests/progress.test.mjs
```

These tests exercise game calculations and persistence behavior. They do not replace browser checks of rendering, touch-keyboard behavior, or accessibility.

### Make a fresh ZIP

Python 3 runs the packaging script using only its standard library:

```sh
python3 scripts/package-download.py
```

By default, it writes `Pace.zip` into the project root's parent directory. To choose another destination:

```sh
python3 scripts/package-download.py --output /absolute/path/Pace.zip
```

The script can be launched from any working directory. It creates a self-contained `Pace/index.html` and includes the source and tests. It excludes deployment identity, Git metadata, and browser-QA helper pages.

## Source layout

```text
dist/
  index.html              Application markup
  styles.css              Responsive interface and motion
  engine.js               Typing calculations, timers, scoring, and date helpers
  content.js              English passages, guided lessons, and daily text
  progress.js              Browser persistence and validated import/export
  app.js                  Interaction, rendering, feedback, and audio
  icon.svg                App icon
  manifest.webmanifest    Hosted web app metadata
tests/
  engine.test.mjs
  progress.test.mjs
scripts/
  package-download.py
```

No analytics, external fonts, downloaded audio, AI calls, or third-party runtime services are required by the app.
