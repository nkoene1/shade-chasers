import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { useControls } from "leva";
import * as THREE from "three";

interface CharacterModelProps {
  rigidBodyRef: React.RefObject<RapierRigidBody | null>;
  inShadowRef: React.RefObject<boolean>;
  groundedRef: React.RefObject<boolean>;
}

export function CharacterModel({ rigidBodyRef, inShadowRef, groundedRef }: CharacterModelProps) {
  const { maxSwing, strideFreq, bobAmount, faceLerp, speedThreshold, poseLerp, animFps } =
    useControls("Character Animation", {
      maxSwing: { value: Math.PI / 4, min: 0, max: Math.PI / 2, step: 0.05 },
      strideFreq: { value: 5, min: 0.5, max: 10, step: 0.25 },
      bobAmount: { value: 0.04, min: 0, max: 0.2, step: 0.005 },
      faceLerp: { value: 10, min: 1, max: 30, step: 1 },
      speedThreshold: { value: 0.3, min: 0, max: 2, step: 0.1 },
      poseLerp: { value: 12, min: 1, max: 30, step: 1 },
      animFps: { value: 24, min: 8, max: 60, step: 1 },
    }, { collapsed: true });

  const { skin, shirt, pants, sunBurnColor, burnLerp, burnIntensity } =
    useControls("Character Colors", {
      skin: "#f0c090",
      shirt: "#4a90d9",
      pants: "#2d3748",
      sunBurnColor: "#cc3300",
      burnLerp: { value: 8, min: 1, max: 30, step: 1 },
      burnIntensity: { value: 0.6, min: 0, max: 2, step: 0.05 },
    }, { collapsed: true });

  const sunBurn = useMemo(() => new THREE.Color(sunBurnColor), [sunBurnColor]);
  const noBurn = useMemo(() => new THREE.Color("#000000"), []);

  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const skinMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const stride = useRef(0);
  const facingAngle = useRef(0);
  const airborneBlend = useRef(0);
  const burnBlend = useRef(0);
  const prevPos = useRef<{ x: number; z: number } | null>(null);
  const mobilityBlend = useRef(1);
  const animAccum = useRef(0);

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
    mobilityBlend.current += (mobilityTarget - mobilityBlend.current) * (1 - Math.exp(-10 * delta));

    const horizontalSpeed = velSpeed * mobilityBlend.current;
    const airborne = !groundedRef.current;

    const targetBlend = airborne ? 1 : 0;
    airborneBlend.current += (targetBlend - airborneBlend.current) * (1 - Math.exp(-poseLerp * delta));

    const targetBurn = inShadowRef.current ? 0 : 1;
    burnBlend.current += (targetBurn - burnBlend.current) * (1 - Math.exp(-burnLerp * delta));
    if (skinMatRef.current) {
      skinMatRef.current.emissive.lerpColors(noBurn, sunBurn, burnBlend.current);
      skinMatRef.current.emissiveIntensity = burnBlend.current * burnIntensity;
    }

    if (horizontalSpeed > speedThreshold && groupRef.current) {
      const targetAngle = Math.atan2(vel.x, vel.z);
      facingAngle.current = lerpAngle(
        facingAngle.current,
        targetAngle,
        1 - Math.exp(-faceLerp * delta),
      );
      groupRef.current.rotation.y = facingAngle.current;
    }

    animAccum.current += delta;
    const animStep = 1 / animFps;
    if (animAccum.current >= animStep) {
      animAccum.current -= animStep;
      if (animAccum.current >= animStep) animAccum.current = 0;

      const ab = airborneBlend.current;
      const t = Math.min(horizontalSpeed / 6, 1);
      stride.current += horizontalSpeed * strideFreq * animStep;
      const runSwing = Math.sin(stride.current) * maxSwing * t;

      const jumpLeg = -0.4;
      const jumpArm = -0.9;

      if (leftLegRef.current) leftLegRef.current.rotation.x = runSwing * (1 - ab) + jumpLeg * ab;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -runSwing * (1 - ab) + jumpLeg * ab;
      if (leftArmRef.current) leftArmRef.current.rotation.x = -runSwing * 0.8 * (1 - ab) + jumpArm * ab;
      if (rightArmRef.current) rightArmRef.current.rotation.x = runSwing * 0.8 * (1 - ab) + jumpArm * ab;

      if (bodyRef.current) {
        bodyRef.current.position.y = Math.abs(Math.sin(stride.current * 2)) * bobAmount * t * (1 - ab);
      }
    }
  });

  return (
    <group ref={groupRef}>
      <group ref={bodyRef}>
        {/* Head */}
        <mesh position={[0, 0.475, 0]} castShadow>
          <boxGeometry args={[0.25, 0.25, 0.25]} />
          <meshStandardMaterial ref={skinMatRef} color={skin} flatShading />
        </mesh>

        {/* Torso */}
        <mesh position={[0, 0.075, 0]} castShadow>
          <boxGeometry args={[0.35, 0.45, 0.2]} />
          <meshStandardMaterial color={shirt} flatShading />
        </mesh>

        {/* Left arm pivot at shoulder */}
        <group ref={leftArmRef} position={[-0.225, 0.25, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <boxGeometry args={[0.1, 0.4, 0.1]} />
            <meshStandardMaterial color={shirt} flatShading />
          </mesh>
        </group>

        {/* Right arm pivot at shoulder */}
        <group ref={rightArmRef} position={[0.225, 0.25, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <boxGeometry args={[0.1, 0.4, 0.1]} />
            <meshStandardMaterial color={shirt} flatShading />
          </mesh>
        </group>
      </group>

      {/* Left leg pivot at hip */}
      <group ref={leftLegRef} position={[-0.1, -0.15, 0]}>
        <mesh position={[0, -0.25, 0]} castShadow>
          <boxGeometry args={[0.13, 0.5, 0.13]} />
          <meshStandardMaterial color={pants} flatShading />
        </mesh>
      </group>

      {/* Right leg pivot at hip */}
      <group ref={rightLegRef} position={[0.1, -0.15, 0]}>
        <mesh position={[0, -0.25, 0]} castShadow>
          <boxGeometry args={[0.13, 0.5, 0.13]} />
          <meshStandardMaterial color={pants} flatShading />
        </mesh>
      </group>
    </group>
  );
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
