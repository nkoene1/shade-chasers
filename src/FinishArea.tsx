import { useControls } from "leva";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { gameState } from "./gameState";
import { type HeightMapData, getTerrainY } from "./useHeightMap";

interface FinishAreaProps {
  heightMap: HeightMapData | null;
  heightScale: number;
}

// Static mesh resolutions — plenty for smooth terrain conforming, cheap to build.
const RADIAL_SEGMENTS = 96;
const GROUND_RING_COUNT = 32;
const WALL_HEIGHT_SEGMENTS = 20;

// Default Leva values. Mirrored as module constants so we can build the
// shader-material uniform objects once in a `useMemo([])` without referring to
// reactive locals (which the React Compiler flags). Actual live values are
// synced via useEffect.
const DEFAULT_COLOR_HEX = "#4de3d0";
const DEFAULT_WALL_OPACITY = 0.7;
const DEFAULT_GROUND_OPACITY = 0.5;
const DEFAULT_FADE_POWER = 4;
const DEFAULT_GROUND_LIFT = 0;

// Sampling grid around each marker vertex. The terrain mesh's triangulated
// interpolation can exceed the heightmap's bilinear sample in between the
// marker's own vertices, so we take the MAX across a small neighborhood to
// guarantee the marker sits above any nearby terrain peak. 3×3 at 0.5m step
// covers a ~1m footprint, wider than the default terrain cell (~0.78m).
const SAMPLE_GRID = 3;
const SAMPLE_SPACING = 0.5;

function maxTerrainYAround(
  heightMap: HeightMapData,
  heightScale: number,
  x: number,
  z: number,
): number {
  let maxY = -Infinity;
  const half = ((SAMPLE_GRID - 1) * SAMPLE_SPACING) / 2;
  for (let i = 0; i < SAMPLE_GRID; i++) {
    for (let j = 0; j < SAMPLE_GRID; j++) {
      const sx = x - half + i * SAMPLE_SPACING;
      const sz = z - half + j * SAMPLE_SPACING;
      const y = getTerrainY(heightMap, heightScale, sx, sz);
      if (y > maxY) maxY = y;
    }
  }
  return maxY;
}

const groundVertexShader = /* glsl */ `
  attribute float aRadialT;
  varying float vRadialT;
  void main() {
    vRadialT = aRadialT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const groundFragmentShader = /* glsl */ `
  uniform vec3  uColor;
  uniform float uOpacity;
  varying float vRadialT;
  void main() {
    // Brighter accent ring near the outer edge, softer fill toward the center.
    float edgeRing = smoothstep(0.85, 1.0, vRadialT);
    float fill = mix(0.55, 0.85, smoothstep(0.0, 0.7, vRadialT));
    float a = uOpacity * (fill + edgeRing * 0.7);
    gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
  }
`;

const wallVertexShader = /* glsl */ `
  attribute float aHeightT;
  varying float vHeightT;
  void main() {
    vHeightT = aHeightT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const wallFragmentShader = /* glsl */ `
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uFadePower;
  varying float vHeightT;
  void main() {
    // Slow fade from opaque base → transparent top.
    float fade = pow(1.0 - vHeightT, uFadePower);
    // Small extra bloom at the very bottom to anchor the wall on the ground.
    float baseGlow = smoothstep(0.0, 0.02, vHeightT) * smoothstep(0.18, 0.02, vHeightT);
    float a = uOpacity * (fade + baseGlow * 0.4);
    gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
  }
`;

export function FinishArea({ heightMap, heightScale }: FinishAreaProps) {
  const {
    radius,
    wallHeight,
    fadePower,
    color,
    wallOpacity,
    groundOpacity,
    groundLift,
    positionX,
    positionZ,
  } = useControls(
    "Finish Area",
    {
      radius: { value: 3, min: 2, max: 25, step: 0.5 },
      wallHeight: { value: 2, min: 1, max: 30, step: 0.5, label: "Wall Height" },
      fadePower: { value: DEFAULT_FADE_POWER, min: 0.5, max: 10, step: 0.1, label: "Fade Steepness" },
      color: DEFAULT_COLOR_HEX,
      wallOpacity: { value: DEFAULT_WALL_OPACITY, min: 0, max: 1, step: 0.05, label: "Wall Opacity" },
      groundOpacity: { value: DEFAULT_GROUND_OPACITY, min: 0, max: 1, step: 0.05, label: "Ground Opacity" },
      groundLift: { value: DEFAULT_GROUND_LIFT, min: -1, max: 1, step: 0.01, label: "Ground Lift" },
      positionX: { value: 1.5, min: -45, max: 45, step: 0.5, label: "Position X" },
      positionZ: { value: -43.5, min: -50, max: 45, step: 0.5, label: "Position Z" },
    },
    { collapsed: true },
  );

  // Subdivided disk that follows the terrain via per-vertex height sampling.
  // Positions are stored in local space; the parent group translates by
  // (positionX, 0, positionZ). Y values are stored as absolute world heights,
  // so the group's Y offset stays 0.
  const groundGeo = useMemo(() => {
    if (!heightMap) return null;

    const vertCount = 1 + GROUND_RING_COUNT * RADIAL_SEGMENTS;
    const positions = new Float32Array(vertCount * 3);
    const radialT = new Float32Array(vertCount);
    const indices = new Uint32Array(
      RADIAL_SEGMENTS * 3 + (GROUND_RING_COUNT - 1) * RADIAL_SEGMENTS * 6,
    );

    // Center vertex
    positions[0] = 0;
    positions[1] = maxTerrainYAround(heightMap, heightScale, positionX, positionZ) + groundLift;
    positions[2] = 0;
    radialT[0] = 0;

    for (let h = 1; h <= GROUND_RING_COUNT; h++) {
      const r = (h / GROUND_RING_COUNT) * radius;
      const t = h / GROUND_RING_COUNT;
      for (let s = 0; s < RADIAL_SEGMENTS; s++) {
        const theta = (s / RADIAL_SEGMENTS) * Math.PI * 2;
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        const y =
          maxTerrainYAround(heightMap, heightScale, positionX + x, positionZ + z) + groundLift;
        const idx = 1 + (h - 1) * RADIAL_SEGMENTS + s;
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;
        radialT[idx] = t;
      }
    }

    let ii = 0;
    for (let s = 0; s < RADIAL_SEGMENTS; s++) {
      const next = (s + 1) % RADIAL_SEGMENTS;
      indices[ii++] = 0;
      indices[ii++] = 1 + s;
      indices[ii++] = 1 + next;
    }
    for (let h = 1; h < GROUND_RING_COUNT; h++) {
      const innerStart = 1 + (h - 1) * RADIAL_SEGMENTS;
      const outerStart = 1 + h * RADIAL_SEGMENTS;
      for (let s = 0; s < RADIAL_SEGMENTS; s++) {
        const next = (s + 1) % RADIAL_SEGMENTS;
        indices[ii++] = innerStart + s;
        indices[ii++] = outerStart + s;
        indices[ii++] = outerStart + next;
        indices[ii++] = innerStart + s;
        indices[ii++] = outerStart + next;
        indices[ii++] = innerStart + next;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aRadialT", new THREE.BufferAttribute(radialT, 1));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
  }, [heightMap, heightScale, radius, positionX, positionZ, groundLift]);

  // Open cylinder at the edge. Each radial column's base sits on the sampled
  // terrain height so the wall meets the ground cleanly even on slopes.
  const wallGeo = useMemo(() => {
    if (!heightMap) return null;

    const cols = RADIAL_SEGMENTS + 1;
    const rows = WALL_HEIGHT_SEGMENTS + 1;
    const vertCount = cols * rows;
    const positions = new Float32Array(vertCount * 3);
    const heightT = new Float32Array(vertCount);
    const indices = new Uint32Array(RADIAL_SEGMENTS * WALL_HEIGHT_SEGMENTS * 6);

    for (let h = 0; h < rows; h++) {
      const v = h / WALL_HEIGHT_SEGMENTS;
      for (let s = 0; s < cols; s++) {
        const u = s / RADIAL_SEGMENTS;
        const theta = u * Math.PI * 2;
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;
        const terrainY = getTerrainY(heightMap, heightScale, positionX + x, positionZ + z);
        const y = terrainY + v * wallHeight;
        const idx = h * cols + s;
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;
        heightT[idx] = v;
      }
    }

    let ii = 0;
    for (let h = 0; h < WALL_HEIGHT_SEGMENTS; h++) {
      for (let s = 0; s < RADIAL_SEGMENTS; s++) {
        const a = h * cols + s;
        const b = h * cols + s + 1;
        const c = (h + 1) * cols + s;
        const d = (h + 1) * cols + s + 1;
        indices[ii++] = a;
        indices[ii++] = c;
        indices[ii++] = b;
        indices[ii++] = b;
        indices[ii++] = c;
        indices[ii++] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aHeightT", new THREE.BufferAttribute(heightT, 1));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
  }, [heightMap, heightScale, radius, wallHeight, positionX, positionZ]);

  const groundUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(DEFAULT_COLOR_HEX) },
      uOpacity: { value: DEFAULT_GROUND_OPACITY },
    }),
    [],
  );

  const wallUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(DEFAULT_COLOR_HEX) },
      uOpacity: { value: DEFAULT_WALL_OPACITY },
      uFadePower: { value: DEFAULT_FADE_POWER },
    }),
    [],
  );

  const groundMatRef = useRef<THREE.ShaderMaterial>(null);
  const wallMatRef = useRef<THREE.ShaderMaterial>(null);

  useEffect(() => {
    const gm = groundMatRef.current;
    const wm = wallMatRef.current;
    if (gm) {
      (gm.uniforms.uColor.value as THREE.Color).set(color);
      gm.uniforms.uOpacity.value = groundOpacity;
    }
    if (wm) {
      (wm.uniforms.uColor.value as THREE.Color).set(color);
      wm.uniforms.uOpacity.value = wallOpacity;
      wm.uniforms.uFadePower.value = fadePower;
    }
  }, [color, groundOpacity, wallOpacity, fadePower]);

  // Publish pose so non-scene code (HUD progress, etc.) can compute
  // distance-to-edge without reaching into Leva.
  useEffect(() => {
    gameState.finishX = positionX;
    gameState.finishY = heightMap
      ? getTerrainY(heightMap, heightScale, positionX, positionZ) + Math.min(wallHeight * 0.5, 1.4)
      : 0;
    gameState.finishZ = positionZ;
    gameState.finishRadius = radius;
  }, [heightMap, heightScale, positionX, positionZ, radius, wallHeight]);

  if (!groundGeo || !wallGeo) return null;

  return (
    <group position={[positionX, 0, positionZ]}>
      <mesh geometry={groundGeo} renderOrder={1}>
        <shaderMaterial
          ref={groundMatRef}
          vertexShader={groundVertexShader}
          fragmentShader={groundFragmentShader}
          uniforms={groundUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={wallGeo} renderOrder={2}>
        <shaderMaterial
          ref={wallMatRef}
          vertexShader={wallVertexShader}
          fragmentShader={wallFragmentShader}
          uniforms={wallUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
