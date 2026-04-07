import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";

const MAX_RAY_DISTANCE = 100;

export function useShadowDetection(
  playerRef: React.RefObject<RapierRigidBody | null>,
  sunPosition: [number, number, number],
) {
  const inShadow = useRef(false);
  const { world, rapier } = useRapier();

  const sunDir = useMemo(
    () => new THREE.Vector3(...sunPosition).normalize(),
    [sunPosition],
  );

  useFrame(() => {
    const rb = playerRef.current;
    if (!rb) return;

    const pos = rb.translation();
    const ray = new rapier.Ray(
      { x: pos.x, y: pos.y, z: pos.z },
      { x: sunDir.x, y: sunDir.y, z: sunDir.z },
    );

    const hit = world.castRay(ray, MAX_RAY_DISTANCE, true, undefined, undefined, undefined, rb);
    inShadow.current = hit !== null;
  });

  return inShadow;
}
