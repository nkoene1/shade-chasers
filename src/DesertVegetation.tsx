import { useGLTF } from "@react-three/drei";
import { useControls } from "leva";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  type HeightMapData,
  TERRAIN_SIZE,
  getTerrainY,
} from "./useHeightMap";

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32)
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------
const SPAWN_EXCLUSION_RADIUS = 5;
const HALF = TERRAIN_SIZE / 2;
const EDGE_MARGIN = 3;

function isNearObstacle(x: number, z: number): boolean {
  const obs: [number, number, number][] = [
    [12, 8, 5], [-10, -12, 5], [20, -15, 5], [-18, 10, 5],
    [6, -6, 4], [-8, 14, 4], [15, 3, 4], [-14, -5, 4], [0, -18, 4],
  ];
  for (const [ox, oz, r] of obs) {
    if ((x - ox) ** 2 + (z - oz) ** 2 < r * r) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Model configuration
// ---------------------------------------------------------------------------
interface ModelVariant {
  path: string;
  count: number;
  scaleRange: [number, number];
  sinkFactor: number;
  tiltRange: number;
  color: THREE.ColorRepresentation;
  colorVariation: number;
}

interface ModelConfig {
  key: string;
  path: string;
  defaultCount: number;
  scaleRange: [number, number];
  sinkFactor: number;
  tiltRange: number;
  color: THREE.ColorRepresentation;
  colorVariation: number;
  isGrass: boolean;
}

const MODEL_CONFIGS: ModelConfig[] = [
  { key: "grassDry", path: "/models/grass-dry.glb", defaultCount: 80, scaleRange: [0.4, 2.0], sinkFactor: 0.0, tiltRange: 0.15, color: "#B89E44", colorVariation: 0.15, isGrass: true },
  { key: "stoneSand", path: "/models/stone-sand.glb", defaultCount: 200, scaleRange: [0.1, 0.25], sinkFactor: 0.15, tiltRange: 0.35, color: "#B8A88A", colorVariation: 0.12, isGrass: false },
];

// ---------------------------------------------------------------------------
// Transform generation
// ---------------------------------------------------------------------------
interface InstanceData {
  matrices: THREE.Matrix4[];
  colors: THREE.Color[];
}

function generateInstances(
  variant: ModelVariant,
  rand: () => number,
  heightMap: HeightMapData,
  heightScale: number,
): InstanceData {
  const matrices: THREE.Matrix4[] = [];
  const colors: THREE.Color[] = [];
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const baseColor = new THREE.Color(variant.color);

  let placed = 0;
  let attempts = 0;
  const maxAttempts = variant.count * 4;

  while (placed < variant.count && attempts < maxAttempts) {
    attempts++;
    const x = (rand() - 0.5) * (TERRAIN_SIZE - EDGE_MARGIN * 2);
    const z = (rand() - 0.5) * (TERRAIN_SIZE - EDGE_MARGIN * 2);

    if (x * x + z * z < SPAWN_EXCLUSION_RADIUS ** 2) continue;
    if (isNearObstacle(x, z)) continue;
    if (Math.abs(x) > HALF - EDGE_MARGIN || Math.abs(z) > HALF - EDGE_MARGIN) continue;

    const y = getTerrainY(heightMap, heightScale, x, z);

    const rotY = rand() * Math.PI * 2;
    const tiltX = (rand() - 0.5) * variant.tiltRange;
    const tiltZ = (rand() - 0.5) * variant.tiltRange;
    q.setFromEuler(new THREE.Euler(tiltX, rotY, tiltZ));

    const s = variant.scaleRange[0] + rand() * (variant.scaleRange[1] - variant.scaleRange[0]);
    const sx = s * (0.6 + rand() * 0.8);
    const sy = s * (0.7 + rand() * 0.6);
    const sz = s * (0.6 + rand() * 0.8);
    scale.set(sx, sy, sz);

    pos.set(x, y - s * variant.sinkFactor, z);

    mat.compose(pos, q, scale);
    matrices.push(mat.clone());

    const c = baseColor.clone();
    const drift = (rand() - 0.5) * 2 * variant.colorVariation;
    c.r = Math.max(0, Math.min(1, c.r + drift));
    c.g = Math.max(0, Math.min(1, c.g + drift * 0.8));
    c.b = Math.max(0, Math.min(1, c.b + drift * 0.6));
    colors.push(c);

    placed++;
  }

  return { matrices, colors };
}

// ---------------------------------------------------------------------------
// Extract LOD0 geometry from GLTF scene, baking the node transform
// ---------------------------------------------------------------------------
function extractLOD0Geometry(scene: THREE.Group): THREE.BufferGeometry | null {
  let geo: THREE.BufferGeometry | null = null;
  scene.updateMatrixWorld(true);
  scene.traverse((child) => {
    if (!geo && child instanceof THREE.Mesh) {
      const g = child.geometry.clone();
      g.applyMatrix4(child.matrixWorld);
      geo = g;
    }
  });
  return geo;
}

// ---------------------------------------------------------------------------
// Sub-component: single instanced model variant
// ---------------------------------------------------------------------------
interface InstancedModelProps {
  path: string;
  instances: InstanceData;
  isGrass: boolean;
}

function InstancedModel({ path, instances, isGrass }: InstancedModelProps) {
  const { scene } = useGLTF(path);
  const ref = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(() => extractLOD0Geometry(scene), [scene]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    mesh.frustumCulled = false;

    for (let i = 0; i < instances.matrices.length; i++) {
      mesh.setMatrixAt(i, instances.matrices[i]);
      mesh.setColorAt(i, instances.colors[i]);
    }
    mesh.count = instances.matrices.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [instances]);

  if (!geometry || instances.matrices.length === 0) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, instances.matrices.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <meshStandardMaterial
        color="#ffffff"
        flatShading
        roughness={isGrass ? 0.85 : 0.95}
        metalness={0}
        side={isGrass ? THREE.DoubleSide : THREE.FrontSide}
      />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface DesertVegetationProps {
  heightMap: HeightMapData | null;
  heightScale: number;
}

const LEVA_SCHEMA = Object.fromEntries(
  MODEL_CONFIGS.map((cfg) => [
    cfg.key,
    { value: cfg.defaultCount, min: 0, max: 500, step: 10, label: cfg.key },
  ]),
);

export function DesertVegetation({ heightMap, heightScale }: DesertVegetationProps) {
  const counts = useControls("Vegetation", LEVA_SCHEMA, { collapsed: true });

  const variants: ModelVariant[] = useMemo(
    () =>
      MODEL_CONFIGS.map((cfg) => ({
        path: cfg.path,
        count: (counts as Record<string, number>)[cfg.key],
        scaleRange: cfg.scaleRange,
        sinkFactor: cfg.sinkFactor,
        tiltRange: cfg.tiltRange,
        color: cfg.color,
        colorVariation: cfg.colorVariation,
      })),
    [counts],
  );

  const allInstances = useMemo(() => {
    if (!heightMap) return null;
    const rand = mulberry32(42);
    return variants.map((variant) =>
      generateInstances(variant, rand, heightMap, heightScale),
    );
  }, [heightMap, heightScale, variants]);

  if (!allInstances) return null;

  return (
    <group>
      {MODEL_CONFIGS.map((cfg, i) => (
        <InstancedModel
          key={cfg.path}
          path={cfg.path}
          instances={allInstances[i]}
          isGrass={cfg.isGrass}
        />
      ))}
    </group>
  );
}

for (const cfg of MODEL_CONFIGS) {
  useGLTF.preload(cfg.path);
}
