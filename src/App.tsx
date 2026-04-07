import { Canvas } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { Physics } from '@react-three/rapier';
import { Leva, useControls } from 'leva';
import { useRef } from 'react';
import * as THREE from 'three';
import './App.css';
import { Ground } from './Ground';
import { Obstacles } from './Obstacles';
import { Player } from './Player';
import { ThirdPersonCamera } from './ThirdPersonCamera';

function Scene() {
	const playerRef = useRef<RapierRigidBody>(null);
	const playerMeshRef = useRef<THREE.Group>(null);
	const yawRef = useRef(0);

	const { background, ambientIntensity, sunPosition, sunIntensity, shadowRadius } =
		useControls('Lighting', {
			background: '#87CEEB',
			ambientIntensity: { value: 0.4, min: 0, max: 2, step: 0.05 },
			sunPosition: { value: [10, 20, 10] as [number, number, number] },
			sunIntensity: { value: 1.2, min: 0, max: 3, step: 0.1 },
			shadowRadius: { value: 2, min: 0, max: 10, step: 0.5 },
		}, { collapsed: true });

	return (
		<>
			<color attach="background" args={[background]} />
			<ambientLight intensity={ambientIntensity} />
			<directionalLight
				castShadow
				position={sunPosition}
				intensity={sunIntensity}
				shadow-mapSize-width={2048}
				shadow-mapSize-height={2048}
				shadow-camera-left={-30}
				shadow-camera-right={30}
				shadow-camera-top={30}
				shadow-camera-bottom={-30}
				shadow-camera-near={0.5}
				shadow-camera-far={80}
				shadow-radius={shadowRadius}
			/>
			<Physics>
				<Ground />
				<Obstacles />
				<Player
					rigidBodyRef={playerRef}
					meshRef={playerMeshRef}
					yawRef={yawRef}
					sunPosition={sunPosition}
				/>
				<ThirdPersonCamera target={playerMeshRef} yawRef={yawRef} />
			</Physics>
		</>
	);
}

export default function App() {
	return (
		<>
			<Leva collapsed={false} />
			<Canvas shadows>
				<Scene />
			</Canvas>
		</>
	);
}
