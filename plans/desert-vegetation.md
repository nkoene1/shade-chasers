# Desert Vegetation — Implementation Plan

## Goal

Add dry desert grass tufts and small rocks scattered across the terrain using `InstancedMesh` for performance. Placement must respect terrain elevation. Visual style matches the low-poly reference (small dark tufts, chunky pebbles).

## Files Touched

| File | Action |
|---|---|
| `src/useHeightMap.ts` | **New** — shared hook + utilities for height-map loading |
| `src/Ground.tsx` | **Edit** — consume the shared hook instead of loading internally |
| `src/DesertVegetation.tsx` | **New** — instanced grass + rocks |
| `src/App.tsx` | **Edit** — mount `<DesertVegetation />` inside Physics |

## Step-by-step

### 1. Extract height-map loading into `useHeightMap.ts`

Move the following out of `Ground.tsx` into a shared module:

- `TERRAIN_SIZE` constant
- `HeightMapData` type
- `sampleHeight()` bilinear-interpolation helper
- A new `getTerrainY(heightMap, heightScale, worldX, worldZ)` convenience function that converts world coordinates → UV → sampled height
- `useHeightMap(src)` hook that loads the image and returns `HeightMapData | null`

`Ground.tsx` will import everything it needs from this module.

### 2. Create `DesertVegetation.tsx`

**Two instanced layers:**

| Layer | Geometry | Count | Scale range | Color palette |
|---|---|---|---|---|
| Grass tufts | 3-blade cluster (3 crossed quads / thin triangles) | ~400 | 0.08–0.2 | dark browns, olive, burnt sienna |
| Small rocks | Low-poly icosahedron (detail 0) with vertex jitter | ~200 | 0.1–0.35 | greys, tan, dusty brown |

**Placement algorithm (per layer):**

1. Seed a deterministic PRNG (so the scatter is stable across renders).
2. Generate random `(x, z)` positions within the terrain bounds (±TERRAIN_SIZE/2), rejecting positions too close to existing obstacles or the center (player spawn area, ~5 unit radius).
3. For each position, call `getTerrainY()` to get the ground height.
4. Apply random Y-axis rotation and slight random scale.
5. Build a `THREE.Matrix4` per instance and set it on the `InstancedMesh`.
6. Assign per-instance color via `instanceColor`.

**Component interface:**

```tsx
interface DesertVegetationProps {
  heightMap: HeightMapData | null;
  heightScale: number;
}
```

The parent (`Scene`) passes the shared height map + current `heightScale` so the vegetation recomputes when terrain shape changes.

### 3. Update `Ground.tsx`

- Remove internal height-map loading; import `useHeightMap`, `sampleHeight`, `TERRAIN_SIZE` from `useHeightMap.ts`.
- Accept `heightMap` and `heightScale` as props instead of owning them (or we keep `heightScale` from leva inside Ground and also pass it up — see step 4).

**Alternatively** (simpler): Ground keeps its leva controls and the `useHeightMap` hook internally, but **also exports** `heightScale` and `heightMap` via a callback/ref so the Scene can forward them. Given that lifting state is cleaner for React, the plan uses the prop approach: `Scene` owns the hook + leva control, and passes data down to both `Ground` and `DesertVegetation`.

### 4. Update `App.tsx` (`Scene`)

```tsx
const heightMap = useHeightMap("/height-maps/sand-dunes.png");
const { heightScale, subdivisions } = useControls("Terrain", { ... });

<Ground heightMap={heightMap} subdivisions={subdivisions} heightScale={heightScale} />
<DesertVegetation heightMap={heightMap} heightScale={heightScale} />
```

## Performance Notes

- InstancedMesh draws all instances in a single draw call per layer — 600 objects in 2 draw calls.
- Geometry is created once in a `useMemo`; instance matrices are set once (recomputed only if heightMap/heightScale changes).
- No per-frame work.
- Grass blades and rocks are purely visual (no physics colliders).

## Out of Scope

- Animated grass sway (can add later with a vertex shader).
- LOD / culling (not needed at 600 instances).
- Dead trees or larger vegetation (future work).
