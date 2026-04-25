# 06 — Round Lifecycle & Start Countdown

## Overview

Introduce a single-player round lifecycle so gameplay starts intentionally rather than at page load. Three phases:

1. **pre-round** — full-screen "SHADE CHASERS" overlay with a Start button. Player is frozen in place. Health bar full. Race timer `00:00:00`. Sun static at its Leva-default angle. Camera rotation still allowed (looking around while paused).
2. **countdown** — overlay dismisses; a big centered `3 → 2 → 1 → START!` runs for 3 s with entry/exit animations. Player still frozen. No health drain. No sun movement. No race timer.
3. **running** — actual gameplay. WASD / jump / roll enabled. Health drain/regen active. Sun starts moving (auto-triggers existing `startTimer`). Race timer counts up in the top HUD.

This plan covers the lifecycle plumbing, the overlay UI, and the countdown animation. Distance-to-target progress is deliberately **out of scope** and comes next.

## Phase state

Phase lives in two places, kept in sync:

- `gameState.phase: RoundPhase` (mutable, read every frame inside `useFrame`, so no React re-render cost)
- `useState<RoundPhase>` in `App.tsx` (drives mounting of overlays/countdown)

```ts
// gameState.ts
export type RoundPhase = 'pre-round' | 'countdown' | 'running';

export const gameState = {
  // existing…
  phase: 'pre-round' as RoundPhase,
  raceStartTime: 0, // performance.now() when phase became 'running'
};
```

Transitions (App-level):

- `pre-round → countdown` — user clicks Start button.
- `countdown → running` — countdown completes. `gameState.raceStartTime = performance.now()`. Trigger existing sun `startTimer()` (Scene listens to phase and calls it).

## Freezing gameplay in non-running phases

**`Player.tsx`** — top of `useFrame`, if `gameState.phase !== 'running'`:

- Zero horizontal velocity (`setLinvel({ x: 0, y: min(vy, 0), z: 0 }, true)`) so gravity still keeps the capsule on the ground.
- Reset `jumpPressed.current = false` and `rollRequested.current = false` so queued input doesn't leak across the phase boundary.
- `return` early (skip input → velocity mapping).

Camera is untouched — `ThirdPersonCamera` keeps working. Mouse look is allowed during pre-round and countdown, matching the chosen design.

**`useHealth.ts`** — if `gameState.phase !== 'running'`:

- Pin health at `maxHealth`.
- Clear `isDraining`.
- `return` before drain/regen math. No death check.

## Sun timer integration

The existing Leva "Sun Timer" still works manually. On top of that:

- `Scene` in `App.tsx` takes a `phase` prop.
- `useEffect` watches `phase`: when it becomes `'running'` and the sun timer isn't already running, call the existing `startTimer()`.
- No change to `stopTimer` / Leva buttons.

## Race timer (top HUD)

The current `hud-timer` placeholder (`01:12:72`) is wired up for real:

- `Hud.tsx` adds a ref for the timer span.
- Inside the existing rAF update loop, if `gameState.phase === 'running'`, format `performance.now() - gameState.raceStartTime` as `MM:SS:CS` and write it to the span. Otherwise render `00:00:00`.

## Pre-round overlay

New component `src/PreRoundOverlay.tsx` + `src/PreRoundOverlay.css`. Pointer-events enabled only on this overlay (game HUD stays non-interactive).

Visual:

- Full-screen fixed backdrop, dimmed + subtle blur (`backdrop-filter: blur(8px) saturate(0.85)`). Dim color uses the scorched palette (`rgba(10,6,3,0.6)`).
- Centered stack: tagline ("OUTRUN THE SUN") → title `SHADE CHASERS` → subtitle ("Stay in the shadows.") → Start button.
- Title uses Rajdhani 700, large, sandy cream (`#e8d5b0`) with amber glow `text-shadow`, matches HUD.
- Start button: amber gradient, black label `START`, subtle box-shadow + embered border. Hover scales to 1.03, active scales to 0.97.

Entry animation (mount):

- Backdrop: `opacity 0 → 1` over 250 ms, `ease-out`.
- Inner stack: `opacity 0 → 1, translateY 16px → 0, scale 0.98 → 1` over 320 ms, `ease-out`, 80 ms delay.

Exit animation (when Start is clicked, before transitioning to countdown):

- Same elements in reverse, 180 ms `ease-out`. Handled via `.leaving` class → then React unmounts after `animationend` / `setTimeout(180)`.

## Countdown component

New component `src/Countdown.tsx` + `src/Countdown.css`.

Behavior:

- Mounted when `phase === 'countdown'`.
- Uses a `setTimeout`-based tick, not rAF, because the cadence is whole seconds:
  - `t = 0`: show "3"
  - `t = 1000`: show "2"
  - `t = 2000`: show "1"
  - `t = 3000`: show "START!" — call `onComplete` at this boundary (so gameplay starts the instant "START!" lands on screen).
  - `t = 3600`: call `onUnmount` / parent setPhase already moved on — component cleans up.

Actually simpler: parent transitions to `'running'` at `t = 3000`. The `Countdown` component *also stays mounted briefly* to play the "START!" exit animation before unmounting. We handle this with an internal `isComplete` flag that keeps rendering for one extra cycle, then calls `onDone`.

Implementation sketch:

```tsx
const STEPS = ['3', '2', '1', 'START!'] as const;
// each step shown for 1000 ms (START! shown for ~600 ms before cleanup)
```

Each step is rendered as `<div className="countdown-step" key={stepIndex}>…</div>`. Because the `key` changes, React re-mounts the node and its CSS keyframe animation re-triggers cleanly.

Animation design (per web-animation-design skill):

Digits (`3`, `2`, `1`) — 1000 ms total per digit:

| Phase | % | Transform | Opacity | Easing implication |
|-------|---|-----------|---------|---------|
| Entry start | 0% | `scale(1.6)` | 0 | ease-out curve baked into keyframe |
| Entry end | 18% | `scale(1.0)` | 1 | |
| Settle | 22% | `scale(1.04)` | 1 | tiny overshoot tap |
| Held | 25–75% | `scale(1.0)` | 1 | |
| Exit | 100% | `scale(2.4)` | 0 | dramatic fade-and-grow exit |

`START!` — 900 ms total, more emphasis:

- Entry 0–25%: `scale(0.4) → scale(1.12) → scale(1.0)` with opacity `0 → 1`, mild overshoot.
- 25–70%: held at `scale(1.0)`, a subtle `1.0 → 1.04 → 1.0` breathing pulse.
- 70–100%: exit `scale(1.0) → scale(1.8)`, opacity `1 → 0`.

Color + typography:

- Digits: Rajdhani 700, ~220 px, `#edd6a8` with layered amber glow `text-shadow: 0 0 40px rgba(255,170,60,.55), 0 0 90px rgba(255,100,30,.25)`.
- `START!`: same font, slightly larger (~240 px), letter-spacing `4px`, brighter core color (`#fff3d6`) and warmer glow (flame-orange). Could optionally use `background-clip: text` with an ember gradient — keeping it single-color first for simplicity.
- No animated `filter: blur`/`backdrop-filter` on digits. Only `transform` and `opacity` (per performance rule).

Accessibility:

- `@media (prefers-reduced-motion: reduce)` on both the overlay and the countdown: set `animation: none`, just toggle `opacity` as a step. Each step still shown for 1 s so the 3-s gating still works, just without motion.
- Countdown root has `role="status"` + `aria-live="polite"` for screen readers, announcing "3", "2", "1", "Go".

## Files

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/gameState.ts` | Add `phase` + `raceStartTime` |
| Modify | `src/Player.tsx` | Gate movement on `phase === 'running'` |
| Modify | `src/useHealth.ts` | Gate drain/regen on `phase === 'running'` |
| Modify | `src/App.tsx` | Own phase state, mount overlays, wire sun timer, pass phase to Scene |
| Modify | `src/Hud.tsx` | Real race-timer display in rAF loop |
| Create | `src/PreRoundOverlay.tsx` | Full-screen start overlay |
| Create | `src/PreRoundOverlay.css` | Overlay styles + entry/exit animations |
| Create | `src/Countdown.tsx` | 3 → 2 → 1 → START! component |
| Create | `src/Countdown.css` | Countdown styles + keyframes |

## Implementation order

1. Extend `gameState.ts` with `phase` + `raceStartTime`.
2. Gate `Player.tsx` movement and `useHealth.ts` drain on phase.
3. Lift phase to `App.tsx`; pass to `Scene`; auto-start sun timer on phase → running.
4. Real race timer in `Hud.tsx`.
5. `PreRoundOverlay` (static style first, then entry/exit animations).
6. `Countdown` (static step display first, then per-step animations, then `START!` flourish).
7. Polish pass + reduced-motion check.

## Out of scope (next)

- Distance-to-target progress bar (next ticket — needs a world target position + player distance calc).
- Post-death / round-end flow.
- Restart button.
