import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";

const MAX_RAY_DISTANCE = 100;
const HEAD_Y_OFFSET = 0.475;

const _sunDir = new THREE.Vector3();

export function useShadowDetection(
  playerRef: React.RefObject<RapierRigidBody | null>,
  sunPositionRef: React.RefObject<THREE.Vector3>,
) {
  const inShadow = useRef(false);
  const { world, rapier } = useRapier();

  useFrame(() => {
    const rb = playerRef.current;
    const sunPos = sunPositionRef.current;
    if (!rb || !sunPos) return;

    _sunDir.copy(sunPos).normalize();

    const pos = rb.translation();
    const ray = new rapier.Ray(
      { x: pos.x, y: pos.y + HEAD_Y_OFFSET, z: pos.z },
      { x: _sunDir.x, y: _sunDir.y, z: _sunDir.z },
    );

    const hit = world.castRay(ray, MAX_RAY_DISTANCE, true, undefined, undefined, undefined, rb);
    inShadow.current = hit !== null;
  });

  return inShadow;
}
