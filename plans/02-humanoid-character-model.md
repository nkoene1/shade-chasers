# Plan: Humanoid Character Model with Running Animation

## Goal

Replace the pink capsule with a humanoid figure built from primitives, and animate it with a running motion when moving.

## Approach: Procedural Box-Person

Rather than importing an external GLB model, build the character from basic Three.js shapes (boxes and capsules). This:

- Fits the "medium-low poly, flat shading with sharp edges" art style from the game's visual identity
- Is fully self-contained (no external assets to download or host)
- Gives full control over the animation
- Keeps the prototype lightweight

## Character Anatomy

All shapes are boxes unless noted. Approximate sizes (width × height × depth):

| Part        | Shape   | Size            |
|-------------|---------|-----------------|
| Head        | Box     | 0.3 × 0.3 × 0.3|
| Torso       | Box     | 0.4 × 0.5 × 0.25|
| Upper arm ×2| Box     | 0.12 × 0.3 × 0.12|
| Lower arm ×2| Box     | 0.1 × 0.25 × 0.1|
| Upper leg ×2| Box     | 0.14 × 0.3 × 0.14|
| Lower leg ×2| Box     | 0.12 × 0.3 × 0.12|

Total height ~1.3 units (matches existing capsule collider).

## Running Animation

Driven procedurally in `useFrame` based on horizontal movement speed:

- **Legs**: alternate swing forward/backward (sinusoidal rotation around X axis at the hip pivot)
- **Arms**: swing opposite to legs (left arm forward when right leg forward)
- **Body**: slight vertical bob (sin at double frequency)
- **Swing amplitude** scales with speed (0 when stationary → full at max speed)
- A time accumulator advances proportional to speed, so limb frequency matches pace

## Character Facing Direction

The character mesh group should rotate to face the movement direction, so the model visually turns when you strafe or change direction. This is independent of the camera yaw.

## Files Touched

| File | Action | Purpose |
|---|---|---|
| `src/CharacterModel.tsx` | **Create** | Mesh hierarchy + procedural animation |
| `src/Player.tsx` | **Edit** | Replace capsule mesh with `<CharacterModel>`, pass speed/direction |

## Implementation Order

1. Create `CharacterModel` with the mesh hierarchy (static pose first)
2. Wire it into `Player.tsx` in place of the capsule mesh
3. Verify the static model renders at the right size and position
4. Add procedural running animation driven by speed
5. Add facing-direction rotation
6. Verify
