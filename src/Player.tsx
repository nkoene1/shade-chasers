import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { CapsuleCollider, RigidBody } from "@react-three/rapier";
import { useControls } from "leva";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CharacterModel } from "./CharacterModel";
import { gameState } from "./gameState";
import { useDistanceProgress } from "./useDistanceProgress";
import { useFinishLine } from "./useFinishLine";
import { useHealth } from "./useHealth";
import { useShadowDetection } from "./useShadowDetection";
import { useRunningSandAudio } from "./useRunningSandAudio";

interface PlayerProps {
  rigidBodyRef: React.RefObject<RapierRigidBody | null>;
  meshRef: React.RefObject<THREE.Group | null>;
  yawRef: React.RefObject<number>;
  sunPositionRef: React.RefObject<THREE.Vector3>;
  spawnPosition: [number, number, number];
}

// Reusable scratch vectors for per-frame movement math. Allocating these inside
// useFrame would create three Vector3 objects every frame the player is active,
// adding steady GC pressure the moment the round transitions to 'running'.
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function Player({ rigidBodyRef, meshRef, yawRef, sunPositionRef, spawnPosition }: PlayerProps) {
  const { speed, jumpVelocity, airControl, rollSpeed, rollDuration, rollCooldown } = useControls("Player", {
    speed: { value: 6, min: 1, max: 20, step: 0.5 },
    jumpVelocity: { value: 8, min: 1, max: 15, step: 0.5 },
    airControl: { value: 0.3, min: 0, max: 1, step: 0.05 },
    rollSpeed: { value: 4, min: 4, max: 30, step: 0.5 },
    rollDuration: { value: 0.85, min: 0.2, max: 2, step: 0.05 },
    rollCooldown: { value: 0.4, min: 0, max: 2, step: 0.05 },
  }, { collapsed: true });

  const keys = useRef({ w: false, a: false, s: false, d: false });
  const jumpPressed = useRef(false);
  const rollRequested = useRef(false);
  const groundContacts = useRef(0);
  const groundedRef = useRef(false);
  const risingFromJump = useRef(false);
  const rollingRef = useRef(false);
  const rollTimer = useRef(0);
  const rollCooldownTimer = useRef(0);
  const rollDir = useRef(new THREE.Vector3());
  const inShadow = useShadowDetection(rigidBodyRef, sunPositionRef, rollingRef);
  const deadRef = useHealth(inShadow);
  useDistanceProgress(rigidBodyRef);
  useFinishLine(rigidBodyRef);
  useRunningSandAudio({
    rigidBodyRef,
    groundedRef,
    rollingRef,
    deadRef,
    maxSpeed: speed,
  });

  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in keys.current) keys.current[k as keyof typeof keys.current] = true;
      if (e.key === " ") jumpPressed.current = true;
      if (e.key === "Shift") rollRequested.current = true;
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

    const position = rb.translation();
    gameState.playerX = position.x;
    gameState.playerY = position.y;
    gameState.playerZ = position.z;

    if (deadRef.current) {
      const v = rb.linvel();
      rb.setLinvel({ x: 0, y: Math.min(v.y, 0), z: 0 }, true);
      rollingRef.current = false;
      jumpPressed.current = false;
      rollRequested.current = false;
      return;
    }

    if (gameState.phase !== 'running') {
      const v = rb.linvel();
      rb.setLinvel({ x: 0, y: Math.min(v.y, 0), z: 0 }, true);
      rollingRef.current = false;
      rollTimer.current = 0;
      jumpPressed.current = false;
      rollRequested.current = false;
      return;
    }

    const yaw = yawRef.current ?? 0;
    _forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    _dir.set(0, 0, 0);
    if (keys.current.w) _dir.add(_forward);
    if (keys.current.s) _dir.sub(_forward);
    if (keys.current.a) _dir.add(_right);
    if (keys.current.d) _dir.sub(_right);

    if (_dir.lengthSq() > 0) _dir.normalize().multiplyScalar(speed);

    const vel = rb.linvel();
    const isGrounded = groundContacts.current > 0;
    groundedRef.current = isGrounded;

    if (!isGrounded) risingFromJump.current = false;

    if (rollCooldownTimer.current > 0) rollCooldownTimer.current -= delta;

    // Start roll
    if (
      rollRequested.current &&
      isGrounded &&
      !rollingRef.current &&
      rollCooldownTimer.current <= 0 &&
      _dir.lengthSq() > 0
    ) {
      rollingRef.current = true;
      rollTimer.current = rollDuration;
      rollDir.current.copy(_dir).normalize().multiplyScalar(rollSpeed);
    }
    rollRequested.current = false;

    // Active roll
    if (rollingRef.current) {
      rollTimer.current -= delta;
      if (rollTimer.current <= 0) {
        rollingRef.current = false;
        rollCooldownTimer.current = rollCooldown;
      } else {
        rb.setLinvel(
          { x: rollDir.current.x, y: Math.min(vel.y, 0), z: rollDir.current.z },
          true,
        );
        jumpPressed.current = false;
        return;
      }
    }

    let yVel = vel.y;

    if (jumpPressed.current && isGrounded) {
      yVel = jumpVelocity;
      risingFromJump.current = true;
    }
    jumpPressed.current = false;

    if (isGrounded) {
      if (!risingFromJump.current) yVel = Math.min(yVel, 0);
      rb.setLinvel({ x: _dir.x, y: yVel, z: _dir.z }, true);
    } else {
      let hx = vel.x;
      let hz = vel.z;
      if (_dir.lengthSq() > 0) {
        const t = 1 - Math.exp(-airControl * 3 * delta);
        hx += (_dir.x - hx) * t;
        hz += (_dir.z - hz) * t;
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
      position={spawnPosition}
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
        <CharacterModel
          rigidBodyRef={rigidBodyRef}
          inShadowRef={inShadow}
          groundedRef={groundedRef}
          rollingRef={rollingRef}
          deadRef={deadRef}
          maxSpeed={speed}
        />
      </group>
    </RigidBody>
  );
}
