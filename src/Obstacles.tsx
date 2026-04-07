import { RigidBody } from "@react-three/rapier";

interface ObstacleProps {
  position: [number, number, number];
  size: [number, number, number];
  color?: string;
}

function BoxObstacle({
  position,
  size,
  color = "#8b8b8b",
}: ObstacleProps) {
  return (
    <RigidBody type="fixed" position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </RigidBody>
  );
}

const OBSTACLES: ObstacleProps[] = [
  { position: [4, 1.5, 4], size: [2, 3, 2], color: "#7a6e65" },
  { position: [-5, 1, 6], size: [3, 2, 1.5], color: "#6e7a65" },
  { position: [8, 2, -3], size: [1.5, 4, 1.5], color: "#656e7a" },
  { position: [-3, 0.75, -5], size: [4, 1.5, 2], color: "#7a6565" },
  { position: [0, 1.25, 10], size: [6, 2.5, 1], color: "#6a6a6a" },
  { position: [-8, 2, 2], size: [1, 4, 3], color: "#7a7565" },
  { position: [6, 0.5, 9], size: [2, 1, 2], color: "#657a6e" },
  { position: [-6, 1.5, -8], size: [2.5, 3, 2.5], color: "#756a7a" },
];

export function Obstacles() {
  return (
    <>
      {OBSTACLES.map((props, i) => (
        <BoxObstacle key={i} {...props} />
      ))}
    </>
  );
}
