import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { gameState } from "./gameState";
import { type HeightMapData, getTerrainY } from "./useHeightMap";

export const DEFAULT_DISTANCE = 2;

const GROUND_CLEARANCE = 0.5;

interface ThirdPersonCameraProps {
  target: React.RefObject<THREE.Group | null>;
  yawRef: React.RefObject<number>;
  heightMap: HeightMapData | null;
  heightScale: number;
}

export function ThirdPersonCamera({ target, yawRef, heightMap, heightScale }: ThirdPersonCameraProps) {
  const { distance, minPitch, maxPitch, sensitivity } = useControls("Camera", {
    distance: { value: DEFAULT_DISTANCE, min: 1, max: 30, step: 0.5 },
    minPitch: { value: -0.3, min: -Math.PI / 3, max: 0.5, step: 0.01 },
    maxPitch: { value: Math.PI / 2.5, min: 0.5, max: Math.PI / 2, step: 0.05 },
    sensitivity: { value: 0.002, min: 0.0005, max: 0.01, step: 0.0005 },
  }, { collapsed: true });

  const { camera, gl } = useThree();
  const pitch = useRef(0.4);

  useEffect(() => {
    const canvas = gl.domElement;

    const onClick = () => {
      if (gameState.phase === "running" && !gameState.isDead) {
        canvas.requestPointerLock();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      (yawRef as React.MutableRefObject<number>).current -=
        e.movementX * sensitivity;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current + e.movementY * sensitivity,
        minPitch,
        maxPitch,
      );
    };

    canvas.addEventListener("click", onClick);
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [gl, yawRef, sensitivity, minPitch, maxPitch]);

  const _worldPos = useRef(new THREE.Vector3());
  const _dir = useRef(new THREE.Vector3());
  const smoothDist = useRef(distance);

  useFrame((_, delta) => {
    const mesh = target.current;
    if (!mesh) return;

    const playerPos = mesh.getWorldPosition(_worldPos.current);

    const dir = _dir.current.set(
      -Math.sin(yawRef.current) * Math.cos(pitch.current),
      Math.sin(pitch.current),
      -Math.cos(yawRef.current) * Math.cos(pitch.current),
    );

    let targetDist = distance;

    if (heightMap) {
      const SAMPLES = 8;
      for (let i = SAMPLES; i >= 1; i--) {
        const d = distance * (i / SAMPLES);
        const cx = playerPos.x + dir.x * d;
        const cy = playerPos.y + dir.y * d;
        const cz = playerPos.z + dir.z * d;
        const groundY = getTerrainY(heightMap, heightScale, cx, cz);
        if (cy < groundY + GROUND_CLEARANCE) {
          targetDist = distance * ((i - 1) / SAMPLES);
        }
      }
    }

    const pullInSpeed = 12;
    const pushOutSpeed = 4;
    const speed = targetDist < smoothDist.current ? pullInSpeed : pushOutSpeed;
    smoothDist.current += (targetDist - smoothDist.current) * (1 - Math.exp(-speed * delta));

    camera.position.set(
      playerPos.x + dir.x * smoothDist.current,
      playerPos.y + dir.y * smoothDist.current,
      playerPos.z + dir.z * smoothDist.current,
    );
    camera.lookAt(playerPos);
  });

  return null;
}
