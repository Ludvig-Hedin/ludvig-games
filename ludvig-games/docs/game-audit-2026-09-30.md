# Game audit and supplied updates, 2026-09-30

## Supplied updates

- Paper — After Hours imports paper-after-hours-v4.html. Existing Paper best and sound keys are preserved. Its real gameplay preview is refreshed.
- HUMAN, probably. imports HUMAN-probably (1).html, with seven tests, points, overtime replay and scorecard export. Its title and URL stay unchanged. The file declares no version, so catalog version remains null. Previous completion-time records remain stored; this release uses its supplied separate points record. Time is not converted into points.
- Downloads originals remain untouched. Replaced artifacts are backed up in output/backups/20260930T055427Z. This folder is outside Git.

## Eleven confirmed defects addressed

| Game | Trigger and effect before | Correction |
| --- | --- | --- |
| PIGEON | Space on focused Play/Resume is swallowed, leaving the visitor on the same screen. | Native menu-button activation takes precedence. Gameplay FLAP retains its held-Space control. |
| AFTERGLOW | Enter on paused Quit resumes driving; Enter on results Menu restarts. | The focused button performs its own action. Gameplay BOOST retains held Space. |
| AFTERGLOW | A resize while paused/results clears the canvas; the frozen scene never redraws. | Resize paints the scene without advancing the simulation. |
| CAGE. | Enter on Training, Settings or difficulty starts a normal fight. | Native button selection takes precedence; Training and Settings open as chosen. |
| Flappy — First Person | Space on a mode, Sound or Home button starts/resumes/retries instead. | Menu actions work with Space. Focused TAP TO FLAP keeps its gameplay shortcut. |
| ONE SMALL FAKE | Enter on paused Main Menu resumes. Space cannot activate Sound/View/Replay. | Menu buttons use native activation, preserving gameplay control shortcuts. |
| KILN | Enter on menu Sound or Test Audio starts a mission. | Enter activates the chosen menu action. Focused JUMP retains Space. |
| HUMAN, probably. | Keyboard Continue after Dread bubbles into Soul and instantly creates an error, breaking the streak. The same event can stamp the next boss. | Continue consumes its own key event, leaving the new round untouched. |
| Origin | Play today retains the date captured on the first rollover. After the next UTC rollover it restarts yesterday. | The action reads the current UTC date when clicked. |
| Origin | Failed local leaderboard writes still claim success and hide the retry form. | Failure is reported clearly, and the form stays available. |
| Origin | The wrapper sandbox blocks the native score form, so visitors cannot save from the normal player page. | Only Origin receives form permission. Its submit handler prevents navigation and writes the local board. |

These fixes preserve deliberate game rules and puzzles, including USER HOSTILE's intentionally frustrating interactions. Origin's unsupported copy about an included server was removed; its published leaderboard is local to the browser.

## Verification scope

- Reproduced original faults with real input on localhost. The paused canvas resize assertion uses RGB content, because this game's opaque canvas reports alpha even when cleared. The storage failure is also checked through Origin's direct-opening fallback, independently of the wrapper permission.
- Checked all fourteen visible games for loading, real entry actions, fullscreen, return navigation and script errors. KILN's desktop mouse capture used foreground headed Chrome.
- Focused assertions cover menu actions, frozen-scene resize, Human's clean next round, two successive UTC rollovers, blocked storage and a successful score save in Origin's wrapper.
- Focused emulated-touch checks cover FLAP, TAP TO FLAP, BOOST and JUMP while focused, plus Paper pause/mode/resume/flick and landscape restart. HUMAN completed all seven tests, exported its scorecard, restarted in overtime and paused/resumed with a frozen timer. Full physical-device gameplay is still outside this check.
- Atlas and Anything remain hidden, with no published routes, raw HTML or thumbnails. Anything's paid backend and monthly pause controls remain unconfigured; its separate launch plan still requires a 1,000 SEK/month cap.

## Limits

This audit checks source and selected reachable flows. It does not claim every level, collision edge case, assistive technology or physical phone has been exercised. The shared hub and changed behaviors are the release checks, rather than a blanket claim that the games contain no bugs.

Published to https://games.ludvighedin.com/. Verified 50 live files against the checked generated output and eight hidden/missing paths return 404. Production deployment: dpl_4pxzxSiDb43UFAkn5yBNwFzVLVjv. Browser checks ran on localhost, and production delivery was checked over HTTPS; physical-phone gameplay remains open.
