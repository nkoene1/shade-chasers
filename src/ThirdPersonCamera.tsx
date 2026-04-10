import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import { useEffect, useRef } from "react";
import * as THREE from "three";

interface ThirdPersonCameraProps {
  target: React.RefObject<THREE.Group | null>;
  yawRef: React.RefObject<number>;
}

export function ThirdPersonCamera({ target, yawRef }: ThirdPersonCameraProps) {
  const { distance, minPitch, maxPitch, sensitivity } = useControls("Camera", {
    distance: { value: 2, min: 2, max: 30, step: 0.5 },
    minPitch: { value: 0.01, min: 0, max: 0.5, step: 0.01 },
    maxPitch: { value: Math.PI / 2.5, min: 0.5, max: Math.PI / 2, step: 0.05 },
    sensitivity: { value: 0.002, min: 0.0005, max: 0.01, step: 0.0005 },
  }, { collapsed: true });

  const { camera, gl } = useThree();
  const pitch = useRef(0.4);

  useEffect(() => {
    const canvas = gl.domElement;

    const onClick = () => canvas.requestPointerLock();

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

  useFrame(() => {
    const mesh = target.current;
    if (!mesh) return;

    const playerPos = mesh.getWorldPosition(_worldPos.current);

    const cameraOffset = new THREE.Vector3(
      -Math.sin(yawRef.current) * Math.cos(pitch.current) * distance,
      Math.sin(pitch.current) * distance,
      -Math.cos(yawRef.current) * Math.cos(pitch.current) * distance,
    );

    camera.position.copy(playerPos).add(cameraOffset);
    camera.lookAt(playerPos);
  });

  return null;
}
