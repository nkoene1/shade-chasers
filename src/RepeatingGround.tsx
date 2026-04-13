import { RigidBody, TrimeshCollider } from "@react-three/rapier";
import { useMemo } from "react";
import * as THREE from "three";
import {
  type HeightMapData,
  TERRAIN_SIZE,
  sampleHeight,
} from "./useHeightMap";

const HALF_TERRAIN = TERRAIN_SIZE / 2;
const OUTER_SIZE = TERRAIN_SIZE * 5;
const INNER_OFFSET = 0.3;
const SEGMENTS = 200;

/**
 * Mirror-repeat UV so tiles are always seamless, even if the height-map
 * edges don't match. Even periods keep the original orientation,
 * odd periods flip — like GL_MIRRORED_REPEAT.
 */
function mirrorRepeat(val: number): number {
  const period = Math.floor(val);
  const frac = val - period;
  return (period & 1) === 0 ? frac : 1 - frac;
}

interface RepeatingGroundProps {
  heightMap: HeightMapData | null;
  heightScale: number;
  colorSteps: [number, number];
}

export function RepeatingGround({
  heightMap,
  heightScale,
  colorSteps,
}: RepeatingGroundProps) {
  const terrain = useMemo(() => {
    if (!heightMap) return null;

    const geo = new THREE.PlaneGeometry(
      OUTER_SIZE,
      OUTER_SIZE,
      SEGMENTS,
      SEGMENTS,
    );
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const rawU = x / TERRAIN_SIZE + 0.5;
      const rawV = z / TERRAIN_SIZE + 0.5;
      const u = mirrorRepeat(rawU);
      const v = mirrorRepeat(rawV);

      const h =
        sampleHeight(
          heightMap.pixels,
          heightMap.width,
          heightMap.height,
          u,
          v,
        ) * heightScale;

      const inside =
        Math.abs(x) <= HALF_TERRAIN && Math.abs(z) <= HALF_TERRAIN;
      pos.setY(i, inside ? h - INNER_OFFSET : h);
    }
    pos.needsUpdate = true;

    const colliderVertices = new Float32Array(pos.array);
    const colliderIndices = new Uint32Array(geo.index!.array);

    const renderGeo = geo.toNonIndexed();
    const niPos = renderGeo.attributes.position;
    const faceCount = niPos.count / 3;
    const colors = new Float32Array(niPos.count * 3);

    const valleyColor = new THREE.Color(0.78, 0.65, 0.38);
    const peakColor = new THREE.Color(0.95, 0.85, 0.55);
    const faceColor = new THREE.Color();

    for (let f = 0; f < faceCount; f++) {
      const base = f * 3;
      const avgY =
        (niPos.getY(base) + niPos.getY(base + 1) + niPos.getY(base + 2)) / 3;
      const tRaw =
        heightScale > 0
          ? Math.max(0, Math.min(1, avgY / heightScale))
          : 0;
      const t = tRaw >= colorSteps[1] ? 1 : tRaw >= colorSteps[0] ? 0.5 : 0;
      faceColor.copy(valleyColor).lerp(peakColor, t);

      for (let vi = 0; vi < 3; vi++) {
        colors[(base + vi) * 3] = faceColor.r;
        colors[(base + vi) * 3 + 1] = faceColor.g;
        colors[(base + vi) * 3 + 2] = faceColor.b;
      }
    }

    renderGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    renderGeo.computeVertexNormals();

    geo.dispose();
    return { renderGeo, colliderVertices, colliderIndices };
  }, [heightMap, heightScale, colorSteps]);

  if (!terrain) return null;

  return (
    <RigidBody type="fixed" colliders={false}>
      <mesh receiveShadow geometry={terrain.renderGeo}>
        <meshStandardMaterial
          vertexColors
          flatShading
          roughness={0.95}
          metalness={0}
        />
      </mesh>
      <TrimeshCollider
        args={[terrain.colliderVertices, terrain.colliderIndices]}
      />
    </RigidBody>
  );
}
