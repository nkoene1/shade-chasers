import { RigidBody, TrimeshCollider } from "@react-three/rapier";
import { useMemo } from "react";
import * as THREE from "three";
import {
  type HeightMapData,
  TERRAIN_SIZE,
  sampleHeight,
} from "./useHeightMap";

interface GroundProps {
  heightMap: HeightMapData | null;
  subdivisions: number;
  heightScale: number;
  colorSteps: [number, number];
}

export function Ground({ heightMap, subdivisions, heightScale, colorSteps }: GroundProps) {
  const terrain = useMemo(() => {
    if (!heightMap) return null;

    const segs = subdivisions;
    const geo = new THREE.PlaneGeometry(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      segs,
      segs,
    );
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const u = x / TERRAIN_SIZE + 0.5;
      const v = z / TERRAIN_SIZE + 0.5;
      const h = sampleHeight(
        heightMap.pixels,
        heightMap.width,
        heightMap.height,
        u,
        v,
      );
      pos.setY(i, h * heightScale);
    }
    pos.needsUpdate = true;

    const colliderVertices = new Float32Array(pos.array);
    const colliderIndices = new Uint32Array(geo.index!.array);

    const renderGeo = geo.toNonIndexed();
    const niPos = renderGeo.attributes.position;
    const faceCount = niPos.count / 3;
    const colors = new Float32Array(niPos.count * 3);

    const valleyColor = new THREE.Color(0.72, 0.63, 0.47);
    const peakColor = new THREE.Color(0.9, 0.84, 0.68);
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

      for (let v = 0; v < 3; v++) {
        colors[(base + v) * 3] = faceColor.r;
        colors[(base + v) * 3 + 1] = faceColor.g;
        colors[(base + v) * 3 + 2] = faceColor.b;
      }
    }

    renderGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    renderGeo.computeVertexNormals();

    geo.dispose();

    return { renderGeo, colliderVertices, colliderIndices };
  }, [heightMap, subdivisions, heightScale, colorSteps]);

  if (!terrain) return null;

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      key={`terrain-${subdivisions}-${heightScale}`}
    >
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
