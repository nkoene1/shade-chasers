import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { useControls } from "leva";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const MODEL_PATH = "/models/Adventurer.gltf";

type AnimationName = "Idle" | "Run" | "Roll";

interface CharacterModelProps {
  rigidBodyRef: React.RefObject<RapierRigidBody | null>;
  inShadowRef: React.RefObject<boolean>;
  groundedRef: React.RefObject<boolean>;
  rollingRef: React.RefObject<boolean>;
}

const MODEL_SCALE = 0.7;
const MODEL_Y_OFFSET = -0.65;

export function CharacterModel({
  rigidBodyRef,
  inShadowRef,
  groundedRef,
  rollingRef,
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
  const prevPos = useRef<{ x: number; z: number } | null>(null);
  const mobilityBlend = useRef(1);
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

    const pos = rb.translation();
    const vel = rb.linvel();
    const velSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

    let mobilityTarget = 1;
    if (prevPos.current && delta > 0 && velSpeed > 0.1) {
      const dx = pos.x - prevPos.current.x;
      const dz = pos.z - prevPos.current.z;
      const actualSpeed = Math.sqrt(dx * dx + dz * dz) / delta;
      mobilityTarget = Math.min(actualSpeed / velSpeed, 1);
    }
    prevPos.current = { x: pos.x, z: pos.z };
    mobilityBlend.current +=
      (mobilityTarget - mobilityBlend.current) * (1 - Math.exp(-10 * delta));

    const horizontalSpeed = velSpeed * mobilityBlend.current;
    const isGrounded = groundedRef.current;

    // Sun burn emissive on skin
    const targetBurn = inShadowRef.current ? 0 : 1;
    burnBlend.current +=
      (targetBurn - burnBlend.current) * (1 - Math.exp(-burnLerp * delta));
    for (const mat of skinMaterials) {
      mat.emissive.lerpColors(noBurn, sunBurn, burnBlend.current);
      mat.emissiveIntensity = burnBlend.current * burnIntensity;
    }

    // Facing rotation
    if (horizontalSpeed > speedThreshold && groupRef.current) {
      const targetAngle = Math.atan2(vel.x, vel.z);
      facingAngle.current = lerpAngle(
        facingAngle.current,
        targetAngle,
        1 - Math.exp(-faceLerp * delta),
      );
      groupRef.current.rotation.y = facingAngle.current;
    }

    // Animation state
    const isRolling = rollingRef.current;

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
