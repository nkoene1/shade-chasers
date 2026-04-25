# 05 — Game HUD & Health System

## Overview

Full in-game HUD overlay with a real health system. Scorched/hot visual theme with solid panels. Health bar features a CSS flame effect at the drain edge. Placeholder elements for multiplayer position, race timer, and distance progress.

## Architecture

### Shared Game State (`src/gameState.ts`)

Module-level mutable object bridging R3F (inside Canvas) and DOM (HUD overlay) without React re-renders:

```ts
export const gameState = {
  health: 100,       // 0–100
  maxHealth: 100,
  inShadow: false,
  isDraining: false,  // true while health actively decreasing
};
```

### Health Hook (`src/useHealth.ts`)

Runs inside R3F `useFrame`:
- Reads existing `inShadowRef` from shadow detection
- Drains health in sunlight (~12 HP/sec, tunable via Leva)
- Regenerates health in shadow (~4 HP/sec, tunable via Leva)
- Clamps at 0 and maxHealth
- Updates `gameState` every frame
- **No death state for now** — bar just empties

### HUD Component (`src/Hud.tsx` + `src/Hud.css`)

HTML overlay rendered outside the Canvas. Reads `gameState` via its own `requestAnimationFrame` loop and updates DOM refs directly — no React re-renders during gameplay.

## Layout

```
┌─[ 1st ]────────────[ 01:12:72 ]────[ PROGRESS 22% ]─┐
│                                                       │
│                      GAME VIEW                        │
│                                                       │
│  [ 🔥 HEALTH ██████████░░░░ ]              [MINIMAP] │
└───────────────────────────────────────────────────────┘
```

## Design

### Palette

| Role | Color | Hex |
|------|-------|-----|
| HUD panel background | Dark charcoal-brown | `#1a1008` |
| HUD border / accent | Amber glow | `rgba(200,136,64,0.15)` |
| Primary text | Sandy cream | `#e8d5b0` |
| Muted label text | Dusty sand | `#8a7a60` |
| Health fill (left) | Deep indigo | `#1a1a3e` |
| Health fill (right/edge) | Steel blue | `#2a5a7e` |
| Health empty (burnt) | Dark char | `#2a1a0a` |
| Flame core | Bright yellow | `#ffdd44` |
| Flame mid | Orange | `#ff8800` |
| Flame outer | Deep orange | `#ff4400` |

### Font

**Rajdhani** (Google Fonts) — condensed, semi-geometric, technical/industrial. Weights 500 + 700.

### Health Bar Flame Effect

- Container of ~8 small CSS-animated "flame tongue" divs at the right edge of the fill
- Each flame: rounded shape, radial gradient yellow→orange→transparent
- Animated upward with varying height, speed, opacity, and delay
- Warm glow (box-shadow) at the edge of the fill
- Flames only visible when `isDraining` is true (CSS class toggle with fade transition)
- The fill itself has a bright ember gradient at its right edge

### Minimap Restyle

Keep rectangular 1:1. Update border, background tint, and shadow to match the scorched HUD palette.

## Files

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/gameState.ts` | Shared mutable game state |
| Create | `src/useHealth.ts` | Health drain/regen logic (useFrame) |
| Create | `src/Hud.tsx` | HUD overlay component |
| Create | `src/Hud.css` | HUD styling + flame animations |
| Modify | `src/App.tsx` | Mount HUD, collapse Leva |
| Modify | `src/App.css` | Restyle minimap frame |
| Modify | `src/Player.tsx` | Wire inShadow → gameState, call useHealth |
| Modify | `src/index.css` | Import Rajdhani font |

## Implementation Order

1. `gameState.ts` — shared state module
2. `useHealth.ts` — health logic hooked into Player
3. `Player.tsx` — wire up useHealth
4. `Hud.tsx` + `Hud.css` — health bar with flame effect
5. Add placeholder HUD elements (position, timer, progress)
6. Restyle minimap frame
7. `App.tsx` — integrate HUD, collapse Leva
8. Polish pass
