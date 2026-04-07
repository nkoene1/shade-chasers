import { RigidBody } from "@react-three/rapier";

export function Ground() {
  return (
    <RigidBody type="fixed" position={[0, -0.5, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[100, 1, 100]} />
        <meshStandardMaterial color="#4a7c59" />
      </mesh>
    </RigidBody>
  );
}
