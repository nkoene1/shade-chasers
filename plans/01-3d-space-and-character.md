# Plan: 3D Space with Controllable Character

## Goal

Replace the default Vite template with a full-screen 3D scene containing a ground plane and a player character controllable via WASD + mouse camera (third-person, Fall Guys-style).

## What We're Building

A minimal playable prototype:

- Full-screen R3F `<Canvas>` as the entire app
- A physics world via `@react-three/rapier`
- A flat ground plane (rigid body)
- A capsule-shaped player character (dynamic rigid body)
- WASD movement: applies velocity to the rigid body relative to the camera's forward direction
- Mouse-controlled third-person camera that orbits around the player
- Pointer lock on click so mouse movement controls the camera without the cursor escaping

## Files Touched

| File | Action | Purpose |
|---|---|---|
| `src/App.tsx` | **Rewrite** | Canvas + Physics wrapper, compose scene |
| `src/App.css` | **Rewrite** | Full-screen canvas styles only |
| `src/index.css` | **Edit** | Reset body/html margin & overflow |
| `src/Player.tsx` | **Create** | Player rigid body, mesh, movement logic |
| `src/Ground.tsx` | **Create** | Ground plane rigid body + mesh |
| `src/ThirdPersonCamera.tsx` | **Create** | Mouse-orbit camera that follows the player |

## Implementation Order

1. **Styles** — strip CSS to just full-screen canvas reset
2. **Ground** — static rigid body + visible plane
3. **App** — Canvas + Physics + Ground (verify: spinning-less 3D scene with a floor)
4. **Player** — capsule rigid body with WASD input driving velocity
5. **ThirdPersonCamera** — pointer-lock orbit camera tracking the player
6. Verify everything works together

## Decisions / Notes

- Player movement uses `setLinvel` on the Rapier rigid body (not translation) so physics collisions work naturally.
- Camera direction determines "forward" for WASD — pressing W moves toward where you're looking.
- Pointer lock activates on canvas click; Escape releases it.
- No jumping for now — ground-only movement keeps scope small.
- Capsule shape for the player avoids tipping-over issues that a box would have.
