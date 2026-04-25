import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { useControls } from "leva";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const MODEL_PATH = "/models/Adventurer.gltf";

type AnimationName = "Idle" | "Run" | "Roll" | "Death";

interface CharacterModelProps {
  rigidBodyRef: React.RefObject<RapierRigidBody | null>;
  inShadowRef: React.RefObject<boolean>;
  groundedRef: React.RefObject<boolean>;
  rollingRef: React.RefObject<boolean>;
  deadRef: React.RefObject<boolean>;
  maxSpeed: number;
}

const MODEL_SCALE = 0.7;
const MODEL_Y_OFFSET = -0.65;
const MIN_RUN_TIME_SCALE = 0.25;
// Rolling window length used to measure actual ground speed. Must be larger
// than the physics timestep (1/60 s) so the sample always spans at least one
// physics step, regardless of how fast the browser renders.
const GROUND_SPEED_WINDOW_SEC = 0.1;

type PosSample = { x: number; z: number; t: number };

export function CharacterModel({
  rigidBodyRef,
  inShadowRef,
  groundedRef,
  rollingRef,
  deadRef,
  maxSpeed,
}: CharacterModelProps) {
  const { faceLerp, speedThreshold, crossfadeDuration } = useControls(
    "Character Animation",
    {
      faceLerp: { value: 10, min: 1, max: 30, step: 1 },
      speedThreshold: { value: 0.3, min: 0, max: 2, step: 0.1 },
      crossfadeDuration: { value: 0.2, min: 0.05, max: 1, step: 0.05 },
    },
    { collapsed: true },
  );

  const { skinColor, sunBurnColor, burnLerp, burnIntensity } = useControls(
    "Character Colors",
    {
      skinColor: "#f7efe5",
      sunBurnColor: "#cc3300",
      burnLerp: { value: 8, min: 1, max: 30, step: 1 },
      burnIntensity: { value: 0.6, min: 0, max: 2, step: 0.05 },
    },
    { collapsed: true },
  );

  const sunBurn = useMemo(() => new THREE.Color(sunBurnColor), [sunBurnColor]);
  const noBurn = useMemo(() => new THREE.Color("#000000"), []);

  const groupRef = useRef<THREE.Group>(null);
  const facingAngle = useRef(Math.PI);
  const burnBlend = useRef(0);
  const posSamples = useRef<PosSample[]>([]);
  const currentAction = useRef<AnimationName>("Idle");

  const gltf = useGLTF(MODEL_PATH);
  const nodes = gltf.nodes as Record<string, THREE.SkinnedMesh & THREE.Bone>;
  const materials = gltf.materials as Record<string, THREE.MeshStandardMaterial>;
  const { actions } = useAnimations(gltf.animations, groupRef);

  useEffect(() => {
    const idle = actions.Idle;
    if (idle) {
      idle.reset().play();
      currentAction.current = "Idle";
    }
  }, [actions]);

  const skinMaterials = useMemo(() => {
    const mats: THREE.MeshStandardMaterial[] = [];
    if (materials.Skin) mats.push(materials.Skin);
    return mats;
  }, [materials]);

  useEffect(() => {
    const col = new THREE.Color(skinColor);
    for (const mat of skinMaterials) mat.color.copy(col);
  }, [skinColor, skinMaterials]);

  useFrame((_, delta) => {
    const rb = rigidBodyRef.current;
    if (!rb) return;

    // `vel` is the velocity Player.tsx just wrote this frame — it represents
    // the player's *intent*, not what actually happened. We use it for the
    // facing-rotation target so the character keeps rotating toward input
    // even when the physics solver prevents motion.
    const vel = rb.linvel();
    const intentSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

    // Measure actual ground speed from a rolling window of post-physics
    // positions. The window must span multiple physics steps, otherwise the
    // render/physics timestep mismatch (~60 Hz physics vs ~120–144 Hz render)
    // will make per-frame deltas alternate between 0 and a jumpy value, and
    // the post-collision velocity reported by Rapier stays at whatever we set
    // via setLinvel — so neither instantaneous signal is reliable.
    const pos = rb.translation();
    const now = performance.now() / 1000;
    posSamples.current.push({ x: pos.x, z: pos.z, t: now });
    while (
      posSamples.current.length > 2 &&
      posSamples.current[1].t <= now - GROUND_SPEED_WINDOW_SEC
    ) {
      posSamples.current.shift();
    }
    const oldest = posSamples.current[0];
    const sampleDt = now - oldest.t;
    let horizontalSpeed = 0;
    if (sampleDt > 1e-3) {
      const dx = pos.x - oldest.x;
      const dz = pos.z - oldest.z;
      horizontalSpeed = Math.sqrt(dx * dx + dz * dz) / sampleDt;
    }
    const isGrounded = groundedRef.current;

    // Slow the run cycle to match effective ground speed (e.g. sliding along a wall)
    const runAction = actions.Run;
    if (runAction) {
      const ratio = maxSpeed > 0 ? horizontalSpeed / maxSpeed : 1;
      runAction.timeScale = THREE.MathUtils.clamp(ratio, MIN_RUN_TIME_SCALE, 1);
    }

    // Sun burn emissive on skin
    const targetBurn = inShadowRef.current ? 0 : 1;
    burnBlend.current +=
      (targetBurn - burnBlend.current) * (1 - Math.exp(-burnLerp * delta));
    for (const mat of skinMaterials) {
      mat.emissive.lerpColors(noBurn, sunBurn, burnBlend.current);
      mat.emissiveIntensity = burnBlend.current * burnIntensity;
    }

    // Facing rotation — gated on input intent, not effective ground speed, so
    // the character keeps rotating toward its input direction even when
    // blocked by a wall.
    if (intentSpeed > speedThreshold && groupRef.current) {
      const targetAngle = Math.atan2(vel.x, vel.z);
      facingAngle.current = lerpAngle(
        facingAngle.current,
        targetAngle,
        1 - Math.exp(-faceLerp * delta),
      );
      groupRef.current.rotation.y = facingAngle.current;
    }

    // Animation state
    const isDead = deadRef.current;
    const isRolling = rollingRef.current;

    if (isDead) {
      if (currentAction.current !== "Death") {
        const prev = actions[currentAction.current];
        const death = actions.Death;
        if (death) {
          death.setLoop(THREE.LoopOnce, 1);
          death.clampWhenFinished = true;
          death.reset().fadeIn(crossfadeDuration).play();
          if (prev && prev !== death) prev.fadeOut(crossfadeDuration);
          currentAction.current = "Death";
        }
      }
      return;
    }

    if (isRolling && currentAction.current !== "Roll") {
      const prev = actions[currentAction.current];
      const roll = actions.Roll;
      if (prev && roll) {
        roll.setLoop(THREE.LoopOnce, 1);
        roll.clampWhenFinished = true;
        roll.reset().fadeIn(crossfadeDuration * 0.5).play();
        prev.fadeOut(crossfadeDuration * 0.5);
      }
      currentAction.current = "Roll";
    } else if (!isRolling && currentAction.current === "Roll") {
      const desired: AnimationName =
        horizontalSpeed > speedThreshold ? "Run" : "Idle";
      const roll = actions.Roll;
      const next = actions[desired];
      if (roll && next) {
        next.reset().fadeIn(crossfadeDuration).play();
        roll.fadeOut(crossfadeDuration);
      }
      currentAction.current = desired;
    } else if (!isRolling && isGrounded) {
      const desired: AnimationName =
        horizontalSpeed > speedThreshold ? "Run" : "Idle";
      if (desired !== currentAction.current) {
        const prev = actions[currentAction.current];
        const next = actions[desired];
        if (prev && next) {
          next.reset().fadeIn(crossfadeDuration).play();
          prev.fadeOut(crossfadeDuration);
        }
        currentAction.current = desired;
      }
    }
  });

  return (
    <group
      ref={groupRef}
      scale={MODEL_SCALE}
      position={[0, MODEL_Y_OFFSET, 0]}
      rotation={[0, Math.PI, 0]}
      dispose={null}
    >
      <group name="CharacterArmature">
        <primitive object={nodes.Root} />
        <group name="Adventurer_Body">
          <skinnedMesh
            name="Cube063"
            geometry={nodes.Cube063.geometry}
            material={materials.Skin}
            skeleton={nodes.Cube063.skeleton}
            castShadow
          />
          <skinnedMesh
            name="Cube063_1"
            geometry={nodes.Cube063_1.geometry}
            material={materials.Green}
            skeleton={nodes.Cube063_1.skeleton}
            castShadow
          />
          <skinnedMesh
            name="Cube063_2"
            geometry={nodes.Cube063_2.geometry}
            material={materials.LightGreen}
            skeleton={nodes.Cube063_2.skeleton}
            castShadow
          />
        </group>
        <group name="Adventurer_Feet">
          <skinnedMesh
            name="Cube052"
            geometry={nodes.Cube052.geometry}
            material={materials.Grey}
            skeleton={nodes.Cube052.skeleton}
            castShadow
          />
          <skinnedMesh
            name="Cube052_1"
            geometry={nodes.Cube052_1.geometry}
            material={materials.Black}
            skeleton={nodes.Cube052_1.skeleton}
            castShadow
          />
        </group>
        <group name="Adventurer_Head">
          <skinnedMesh
            name="Cube039"
            geometry={nodes.Cube039.geometry}
            material={materials.Skin}
            skeleton={nodes.Cube039.skeleton}
            castShadow
          />
          <skinnedMesh
            name="Cube039_1"
            geometry={nodes.Cube039_1.geometry}
            material={materials.Eyebrows}
            skeleton={nodes.Cube039_1.skeleton}
            castShadow
          />
          <skinnedMesh
            name="Cube039_2"
            geometry={nodes.Cube039_2.geometry}
            material={materials.Hair}
            skeleton={nodes.Cube039_2.skeleton}
            castShadow
          />
          <skinnedMesh
            name="Cube039_3"
            geometry={nodes.Cube039_3.geometry}
            material={materials.Eye}
            skeleton={nodes.Cube039_3.skeleton}
            castShadow
          />
        </group>
        <group name="Adventurer_Legs">
          <skinnedMesh
            name="Cube020"
            geometry={nodes.Cube020.geometry}
            material={materials.Brown}
            skeleton={nodes.Cube020.skeleton}
            castShadow
          />
          <skinnedMesh
            name="Cube020_1"
            geometry={nodes.Cube020_1.geometry}
            material={materials.Brown2}
            skeleton={nodes.Cube020_1.skeleton}
            castShadow
          />
        </group>
        <group name="Backpack">
          <skinnedMesh
            name="Plane"
            geometry={nodes.Plane.geometry}
            material={materials.Brown}
            skeleton={nodes.Plane.skeleton}
            castShadow
          />
          <skinnedMesh
            name="Plane_1"
            geometry={nodes.Plane_1.geometry}
            material={materials.LightGreen}
            skeleton={nodes.Plane_1.skeleton}
            castShadow
          />
          <skinnedMesh
            name="Plane_2"
            geometry={nodes.Plane_2.geometry}
            material={materials.Gold}
            skeleton={nodes.Plane_2.skeleton}
            castShadow
          />
          <skinnedMesh
            name="Plane_3"
            geometry={nodes.Plane_3.geometry}
            material={materials.Green}
            skeleton={nodes.Plane_3.skeleton}
            castShadow
          />
        </group>
      </group>
    </group>
  );
}

useGLTF.preload(MODEL_PATH);

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
