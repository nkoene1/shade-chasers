import { PointMaterial, Points } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  CuboidCollider,
  RigidBody,
  interactionGroups,
} from "@react-three/rapier";
import { useControls } from "leva";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TERRAIN_SIZE } from "./useHeightMap";

const HALF = TERRAIN_SIZE / 2;

/** Raycast filter that only hits group 0 (terrain/obstacles), skipping the barrier (group 1). */
export const SHADOW_RAY_GROUPS = interactionGroups([0], [0]);
const WALL_THICKNESS = 0.5;
const SEGS_PER_SIDE = 48;
const SEGS_H = 32;

// ─── Square-tube geometry ────────────────────────────────────────────

// Corners clockwise from SW, with per-side outward normals (xz)
const CORNERS: [number, number][] = [
  [-HALF, -HALF],
  [HALF, -HALF],
  [HALF, HALF],
  [-HALF, HALF],
];
const SIDE_NORMALS: [number, number][] = [
  [0, -1],  // south
  [1, 0],   // east
  [0, 1],   // north
  [-1, 0],  // west
];

function buildSquareTube(height: number): THREE.BufferGeometry {
  const totalCols = SEGS_PER_SIDE * 4;
  const cols = totalCols + 1;
  const rows = SEGS_H + 1;
  const vertCount = cols * rows;

  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const outwards = new Float32Array(vertCount * 3);

  for (let col = 0; col < cols; col++) {
    const t = col / totalCols;
    const perimT = t * 4;
    const side = Math.min(Math.floor(perimT), 3);
    const sideT = perimT - side;

    const c0 = CORNERS[side];
    const c1 = CORNERS[(side + 1) % 4];
    const x = c0[0] + (c1[0] - c0[0]) * sideT;
    const z = c0[1] + (c1[1] - c0[1]) * sideT;

    // Outward direction — blend diagonally at corners
    let nx: number;
    let nz: number;
    const atCorner = col % SEGS_PER_SIDE === 0;
    if (atCorner) {
      const k = col / SEGS_PER_SIDE;
      const prevSide = (k - 1 + 4) % 4;
      const curSide = k % 4;
      nx = SIDE_NORMALS[prevSide][0] + SIDE_NORMALS[curSide][0];
      nz = SIDE_NORMALS[prevSide][1] + SIDE_NORMALS[curSide][1];
      const len = Math.sqrt(nx * nx + nz * nz);
      nx /= len;
      nz /= len;
    } else {
      nx = SIDE_NORMALS[side][0];
      nz = SIDE_NORMALS[side][1];
    }

    for (let row = 0; row < rows; row++) {
      const idx = col * rows + row;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = (row / SEGS_H) * height;
      positions[idx * 3 + 2] = z;
      uvs[idx * 2] = t;
      uvs[idx * 2 + 1] = row / SEGS_H;
      outwards[idx * 3] = nx;
      outwards[idx * 3 + 1] = 0;
      outwards[idx * 3 + 2] = nz;
    }
  }

  const indices = new Uint32Array(totalCols * SEGS_H * 6);
  let ii = 0;
  for (let col = 0; col < totalCols; col++) {
    for (let row = 0; row < SEGS_H; row++) {
      const a = col * rows + row;
      const b = a + 1;
      const c = (col + 1) * rows + row;
      const d = c + 1;
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
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute("aOutward", new THREE.BufferAttribute(outwards, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

// ─── Shaders ─────────────────────────────────────────────────────────

const vertexShader = /* glsl */ `
  attribute vec3 aOutward;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float wave = sin(pos.y * 0.6 + uTime * 1.2) * 0.8 * vUv.y
               + sin(pos.y * 1.4 - uTime * 0.7) * 0.4 * vUv.y;
    pos += aOutward * wave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor1;
  uniform vec3  uColor2;
  uniform float uOpacity;
  varying vec2  vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv * vec2(8.0, 3.0);
    float n = fbm(uv + vec2(uTime * 0.15, -uTime * 0.4));
    n += 0.5 * fbm(uv * 2.0 + vec2(-uTime * 0.1, -uTime * 0.25));
    n = clamp(n, 0.0, 1.0);

    vec3 col = mix(uColor1, uColor2, n);

    float edgeFade = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.7, vUv.y);

    gl_FragColor = vec4(col, uOpacity * edgeFade * (0.5 + 0.5 * n));
  }
`;

// ─── Particles ───────────────────────────────────────────────────────

function makeParticlePositions(count: number, height: number, spread: number): Float32Array {
  const arr = new Float32Array(count * 3);
  const perimeter = TERRAIN_SIZE * 4;
  for (let i = 0; i < count; i++) {
    const along = Math.random() * perimeter;
    let x: number, z: number;
    if (along < TERRAIN_SIZE) {
      x = -HALF + along;
      z = -HALF;
    } else if (along < TERRAIN_SIZE * 2) {
      x = HALF;
      z = -HALF + (along - TERRAIN_SIZE);
    } else if (along < TERRAIN_SIZE * 3) {
      x = HALF - (along - TERRAIN_SIZE * 2);
      z = HALF;
    } else {
      x = -HALF;
      z = HALF - (along - TERRAIN_SIZE * 3);
    }
    x += (Math.random() - 0.5) * spread;
    z += (Math.random() - 0.5) * spread;
    arr[i * 3] = x;
    arr[i * 3 + 1] = Math.random() * height;
    arr[i * 3 + 2] = z;
  }
  return arr;
}

// ─── Component ───────────────────────────────────────────────────────

export function SandstormBarrier() {
  const { wallHeight, wallOpacity, particleCount, particleSpread } = useControls(
    "Sandstorm",
    {
      wallHeight: { value: 30, min: 5, max: 60, step: 1 },
      wallOpacity: { value: 0.4, min: 0.1, max: 1, step: 0.05 },
      particleCount: { value: 500, min: 100, max: 2000, step: 50 },
      particleSpread: { value: 1, min: 0.5, max: 15, step: 0.5, label: 'Particle Spread' },
    },
    { collapsed: true },
  );

  const shaderRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color(0.76, 0.6, 0.38) },
      uColor2: { value: new THREE.Color(0.9, 0.78, 0.55) },
      uOpacity: { value: wallOpacity },
    }),
    [],
  );

  useFrame((_state, delta) => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value += delta;
      shaderRef.current.uniforms.uOpacity.value = wallOpacity;
    }
  });

  const tubeGeo = useMemo(() => buildSquareTube(wallHeight), [wallHeight]);

  // ── Particles ──
  const particlePositions = useMemo(
    () => makeParticlePositions(particleCount, wallHeight, particleSpread),
    [particleCount, wallHeight, particleSpread],
  );

  const pointsRef = useRef<THREE.Points>(null);

  useFrame((_state, delta) => {
    if (!pointsRef.current) return;
    const pos = pointsRef.current.geometry.attributes
      .position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length / 3; i++) {
      const i3 = i * 3;
      arr[i3 + 1] += delta * (1.5 + Math.sin(i * 0.73) * 0.8);
      arr[i3] += Math.sin(i * 1.17 + arr[i3 + 1] * 0.3) * delta * 0.5;
      arr[i3 + 2] += Math.cos(i * 0.83 + arr[i3 + 1] * 0.3) * delta * 0.5;
      if (arr[i3 + 1] > wallHeight) {
        arr[i3 + 1] = 0;
      }
    }
    pos.needsUpdate = true;
  });

  return (
    <>
      {/* Invisible collision walls — group 1 so shadow raycasts (group 0) skip them */}
      <RigidBody type="fixed" colliders={false} collisionGroups={interactionGroups([1], [0])}>
        <CuboidCollider
          args={[HALF, wallHeight / 2, WALL_THICKNESS / 2]}
          position={[0, wallHeight / 2, -HALF]}
        />
        <CuboidCollider
          args={[HALF, wallHeight / 2, WALL_THICKNESS / 2]}
          position={[0, wallHeight / 2, HALF]}
        />
        <CuboidCollider
          args={[WALL_THICKNESS / 2, wallHeight / 2, HALF]}
          position={[-HALF, wallHeight / 2, 0]}
        />
        <CuboidCollider
          args={[WALL_THICKNESS / 2, wallHeight / 2, HALF]}
          position={[HALF, wallHeight / 2, 0]}
        />
      </RigidBody>

      {/* Continuous square-tube sandstorm wall */}
      <mesh geometry={tubeGeo}>
        <shaderMaterial
          ref={shaderRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Sparse sand particles */}
      <Points ref={pointsRef} positions={particlePositions} stride={3}>
        <PointMaterial
          transparent
          color="#c8a86e"
          size={0.08}
          sizeAttenuation
          depthWrite={false}
          opacity={0.7}
        />
      </Points>
    </>
  );
}
