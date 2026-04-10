import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { CapsuleCollider, RigidBody } from "@react-three/rapier";
import { useControls } from "leva";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CharacterModel } from "./CharacterModel";
import { useShadowDetection } from "./useShadowDetection";

interface PlayerProps {
  rigidBodyRef: React.RefObject<RapierRigidBody | null>;
  meshRef: React.RefObject<THREE.Group | null>;
  yawRef: React.RefObject<number>;
  sunPositionRef: React.RefObject<THREE.Vector3>;
}

export function Player({ rigidBodyRef, meshRef, yawRef, sunPositionRef }: PlayerProps) {
  const { speed, jumpVelocity, airControl } = useControls("Player", {
    speed: { value: 6, min: 1, max: 20, step: 0.5 },
    jumpVelocity: { value: 8, min: 1, max: 15, step: 0.5 },
    airControl: { value: 0.3, min: 0, max: 1, step: 0.05 },
  }, { collapsed: true });

  const keys = useRef({ w: false, a: false, s: false, d: false });
  const jumpPressed = useRef(false);
  const groundContacts = useRef(0);
  const groundedRef = useRef(false);
  const risingFromJump = useRef(false);
  const inShadow = useShadowDetection(rigidBodyRef, sunPositionRef);

  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in keys.current) keys.current[k as keyof typeof keys.current] = true;
      if (e.key === " ") jumpPressed.current = true;
    };
    const handleUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in keys.current)
        keys.current[k as keyof typeof keys.current] = false;
    };
    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
    };
  }, []);

  useFrame((_, delta) => {
    const rb = rigidBodyRef.current;
    if (!rb) return;

    const yaw = yawRef.current ?? 0;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    const dir = new THREE.Vector3();
    if (keys.current.w) dir.add(forward);
    if (keys.current.s) dir.sub(forward);
    if (keys.current.a) dir.add(right);
    if (keys.current.d) dir.sub(right);

    if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(speed);

    const vel = rb.linvel();
    const isGrounded = groundContacts.current > 0;
    groundedRef.current = isGrounded;

    if (!isGrounded) risingFromJump.current = false;

    let yVel = vel.y;

    if (jumpPressed.current && isGrounded) {
      yVel = jumpVelocity;
      risingFromJump.current = true;
    }
    jumpPressed.current = false;

    if (isGrounded) {
      if (!risingFromJump.current) yVel = Math.min(yVel, 0);
      rb.setLinvel({ x: dir.x, y: yVel, z: dir.z }, true);
    } else {
      let hx = vel.x;
      let hz = vel.z;
      if (dir.lengthSq() > 0) {
        const t = 1 - Math.exp(-airControl * 3 * delta);
        hx += (dir.x - hx) * t;
        hz += (dir.z - hz) * t;
      }
      rb.setLinvel({ x: hx, y: yVel, z: hz }, true);
    }
  });

  const onGroundEnter = () => { groundContacts.current++; };
  const onGroundExit = () => { groundContacts.current--; };

  return (
    <RigidBody
      ref={rigidBodyRef}
      colliders={false}
      position={[0, 15, 0]}
      lockRotations
    >
      <CapsuleCollider args={[0.35, 0.3]} />
      <CapsuleCollider
        sensor
        args={[0.01, 0.25]}
        position={[0, -0.64, 0]}
        onIntersectionEnter={onGroundEnter}
        onIntersectionExit={onGroundExit}
      />
      <group ref={meshRef}>
        <CharacterModel rigidBodyRef={rigidBodyRef} inShadowRef={inShadow} groundedRef={groundedRef} />
      </group>
    </RigidBody>
  );
}
