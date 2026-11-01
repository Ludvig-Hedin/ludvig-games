# Penthouse Panic — focused QA notes

## Core loop gates

- First delivery must be achievable within 15 seconds without reading a separate controls page.
- A pickup press must not also trigger a throw on its keyup. Carrying requires a new charge/release press.
- The projected landing indicator must use the same launch position, gravity, and velocity as the actual throw.
- Player two must aim without a mouse. Last movement direction plus a clear arrow is sufficient.
- Delivery triggers only for a released prop that reaches the cargo deck, never one still carried over it.
- Only one score award per prop. Removing/delivering a prop must clear all holding references.
- Fallen players and props respawn promptly. Remaining quota must always stay attainable.
- The timer starts after the countdown and stops once, on completion or timeout.
- End-of-round UI explains score, saved best, stars, and next action in one glance.

## Input and UI failure cases

- Hold pickup, pause, release, resume: no stuck charging or ghost throw.
- Hold movement and switch browser tabs: movement clears on blur/visibility loss.
- Touch joystick and charge button simultaneously; pointercancel clears each independently.
- Mobile buttons remain above safe-area insets and do not block HUD/result actions.
- Main menu, pause, help, settings, and result buttons are keyboard reachable.
- No page scrolling from gameplay arrow/space keys, but form inputs still accept typing.
- Muted audio remains muted after restarting or changing modes; unlock cannot create duplicate music loops.
- localStorage denied/corrupt: game still starts with defaults.
- WebGL failure: display actionable message instead of an endless loading screen.

## Multiplayer gates

- Host accepts exactly one guest. Join does not claim success before the data channel opens.
- Late join receives round seed/config plus full latest state.
- Guest sends inputs only. Host alone updates physics, score, timer, item ownership, level progression.
- Disconnect clears all remote held keys and surfaces a recovery action without freezing solo controls.
- Closing a room destroys timers, listeners, and connection objects.
- Snapshot interpolation does not modify host authority or turn stale carry state into duplicate scores.
- Input packets reject non-finite numbers and invalid player IDs.
- Two desktop tabs can validate protocol and state, but that does not prove connectivity across all remote networks.

## Minimal meaningful test pass

1. Start solo; move, pick up, throw, score, fall, respawn; complete a round and restart.
2. Play local co-op with both movement/action keys held; independently pick up different props and score.
3. Miss every early throw and recover all items; quota remains reachable until timer expires.
4. Exercise pause while charging, window blur while moving, and resize to a narrow phone viewport.
5. Create and join online room with two actual browser contexts; verify host and guest see matching score/item ownership.
6. Disconnect guest during carry; host remains playable and no item is permanently held.
7. Reload and confirm best/progression and selected settings persist.

## Design restraint

Keep the first round to one understandable objective. Combos, medals, unlocks, and a daily layout provide replay. Do not add currencies, shops, quests, or fake online opponents before the throw-and-deliver loop feels good.
