# Obstacles, Sun Shadows, and Shadow Detection

## Shadow detection approach — Rapier raycast

There are several ways to detect whether the player is in shadow:

- **GPU shadow map readback** — sample the light's depth texture on CPU. Accurate but requires async `readPixels`, is resolution-dependent, and adds GPU-CPU sync stalls.
- **Custom geometric projection** — project obstacle silhouettes onto the ground and do point-in-polygon tests. Complex math, doesn't scale.
- **Rapier raycast toward the sun** — cast a ray from the player in the direction of the sun. If an obstacle collider blocks the ray, the player is in shadow.

**Recommendation: Rapier raycast.** It is synchronous, essentially free (one ray per frame), needs no new dependencies, and naturally agrees with the visual shadows because both use the same obstacle geometry and light direction. It also works seamlessly as the sun moves later.

## What to build

### 1. Sun light with shadow maps — edit `src/App.tsx`

The current `<directionalLight>` has no shadow config. Enable shadow casting and configure the shadow camera frustum to cover the play area. Also set `shadows` on the `<Canvas>` element.

### 2. Ground receives shadows — edit `src/Ground.tsx`

Add `receiveShadow` to the ground mesh so shadow maps render visually on it.

### 3. Test obstacles — create `src/Obstacles.tsx`

A handful of static rigid bodies (boxes and cylinders of varying sizes) scattered near the spawn point. Each mesh gets `castShadow`. The obstacles need physics colliders so:
- The player collides with them
- The shadow raycast can hit them

### 4. Shadow detection — create `src/useShadowDetection.ts`

A custom hook that runs a Rapier raycast each frame:

- **Origin:** player position (from `rigidBodyRef`)
- **Direction:** toward the sun (negate the light direction; light at `[10, 20, 10]` shining toward origin gives ray direction `normalize(10, 20, 10)`)
- **Exclude:** the player's own rigid body (via rapier filter)
- **Result:** `inShadow: boolean` ref, updated every frame

Uses `useRapier()` to access the rapier world and module for raycasting.

### 5. Wire it up and show state — edit `src/Player.tsx`

Call `useShadowDetection` in Player, pass the result to `CharacterModel`. As a simple visual indicator for now, tint the character slightly when in shadow vs in sun (e.g. a subtle color shift or emissive glow).

### 6. CharacterModel indicator — edit `src/CharacterModel.tsx`

Accept an `inShadow` prop/ref and apply a visual indicator (e.g. toggle emissive on the torso material when in sun as a "burning" hint).

## Files summary

| File | Action |
|---|---|
| `src/App.tsx` | Enable `shadows` on Canvas, configure directional light shadow props |
| `src/Ground.tsx` | Add `receiveShadow` to ground mesh |
| `src/Obstacles.tsx` | **Create** — static rigid body obstacles with `castShadow` |
| `src/useShadowDetection.ts` | **Create** — hook: rapier raycast toward sun, returns `inShadow` |
| `src/Player.tsx` | Call hook, pass shadow state to character model |
| `src/CharacterModel.tsx` | Visual indicator for in-shadow vs in-sun |
