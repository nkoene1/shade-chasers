import { Stats } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import type { RapierRigidBody } from '@react-three/rapier';
import { Physics } from '@react-three/rapier';
import { button, Leva, useControls } from 'leva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import './App.css';
import { DesertVegetation } from './DesertVegetation';
import { Ground } from './Ground';
import { Minimap } from './Minimap';
import { Obstacles } from './Obstacles';
import { Player } from './Player';
import { RepeatingGround } from './RepeatingGround';
import { SandstormBarrier } from './SandstormBarrier';
import { Sun, SUN_LAYER } from './Sun';
import { ThirdPersonCamera } from './ThirdPersonCamera';
import { useHeightMap } from './useHeightMap';

function Scene() {
	const playerRef = useRef<RapierRigidBody>(null);
	const playerMeshRef = useRef<THREE.Group>(null);
	const yawRef = useRef(Math.PI);

	const heightMap = useHeightMap('/height-maps/sand-dunes.png');

	const { subdivisions, heightScale, colorStep2, colorStep3 } = useControls(
		'Terrain',
		{
			subdivisions: { value: 128, min: 16, max: 512, step: 16 },
			heightScale: { value: 8, min: 0, max: 20, step: 0.5 },
			colorStep2: { value: 0.15, min: 0.01, max: 0.99, step: 0.01, label: 'Color Step 2 Start' },
			colorStep3: { value: 0.35, min: 0.02, max: 1, step: 0.01, label: 'Color Step 3 Start' },
		},
		{ collapsed: true },
	);

	const DEFAULT_SUN_ANGLE = 15;

	const [{ background, ambientIntensity, sunAngle, sunDirection, sunDistance, sunSize, sunIntensity, shadowRadius }, setLighting] =
		useControls('Lighting', () => ({
			background: '#87CEEB',
			ambientIntensity: { value: 0.4, min: 0, max: 2, step: 0.05 },
			sunAngle: { value: DEFAULT_SUN_ANGLE, min: 0, max: 90, step: 1, label: 'Sun Angle (0–90%)' },
			sunDirection: { value: 270, min: 0, max: 360, step: 1, label: 'Sun Direction (°)' },
			sunDistance: { value: 80, min: 80, max: 200, step: 5 },
			sunSize: { value: 5, min: 1, max: 10, step: 0.5 },
			sunIntensity: { value: 1.2, min: 0, max: 3, step: 0.1 },
			shadowRadius: { value: 1, min: 0, max: 10, step: 0.5 },
		}), { collapsed: true });

	const directionalLightRef = useRef<THREE.DirectionalLight>(null);
	const sunGroupRef = useRef<THREE.Group>(null);
	const sunPositionRef = useRef(new THREE.Vector3());

	const [timerRunning, setTimerRunning] = useState(false);
	const timerRunningRef = useRef(false);
	const startTimeRef = useRef(0);
	const stopRequestedRef = useRef(false);

	const stopTimer = useCallback(() => {
		timerRunningRef.current = false;
		stopRequestedRef.current = false;
		setTimerRunning(false);
		setLighting({ sunAngle: DEFAULT_SUN_ANGLE });
	}, [setLighting]);

	const startTimer = useCallback(() => {
		startTimeRef.current = performance.now();
		timerRunningRef.current = true;
		stopRequestedRef.current = false;
		setTimerRunning(true);
		setLighting({ sunAngle: 0 });
	}, [setLighting]);

	const { timerDuration } = useControls('Sun Timer', {
		timerDuration: { value: 90, min: 10, max: 300, step: 5, label: 'Duration (s)' },
		'Start': button(startTimer, { disabled: timerRunning }),
		'Stop': button(stopTimer, { disabled: !timerRunning }),
	}, { collapsed: true }, [startTimer, stopTimer, timerRunning]);

	const timerDurationRef = useRef(timerDuration);
	timerDurationRef.current = timerDuration;

	const sunPosition = useMemo<[number, number, number]>(() => {
		const elevationRad = (sunAngle / 90) * (Math.PI / 2);
		const azimuthRad = (sunDirection * Math.PI) / 180;
		const horizontal = sunDistance * Math.cos(elevationRad);
		return [
			horizontal * Math.cos(azimuthRad),
			sunDistance * Math.sin(elevationRad),
			horizontal * Math.sin(azimuthRad),
		];
	}, [sunAngle, sunDirection, sunDistance]);

	sunPositionRef.current.set(sunPosition[0], sunPosition[1], sunPosition[2]);

	const sunDirRef = useRef(new THREE.Vector3());

	useFrame((state) => {
		state.camera.layers.enable(SUN_LAYER);
		if (timerRunningRef.current) {
			const elapsed = performance.now() - startTimeRef.current;
			const progress = Math.min(elapsed / (timerDurationRef.current * 1000), 1);
			const angle = progress * 90;

			const elevationRad = (angle / 90) * (Math.PI / 2);
			const azimuthRad = (sunDirection * Math.PI) / 180;
			const horizontal = sunDistance * Math.cos(elevationRad);
			const x = horizontal * Math.cos(azimuthRad);
			const y = sunDistance * Math.sin(elevationRad);
			const z = horizontal * Math.sin(azimuthRad);

			sunPositionRef.current.set(x, y, z);

			if (directionalLightRef.current) {
				directionalLightRef.current.position.set(x, y, z);
			}

			if (progress >= 1 && !stopRequestedRef.current) {
				stopRequestedRef.current = true;
				stopTimer();
			}
		}

		if (sunGroupRef.current) {
			sunDirRef.current.copy(sunPositionRef.current).normalize();
			sunGroupRef.current.position
				.copy(state.camera.position)
				.addScaledVector(sunDirRef.current, sunDistance);
		}
	});

	const { fogDensity, fogColor } = useControls('Fog', {
		fogDensity: { value: 0.012, min: 0, max: 0.05, step: 0.001 },
		fogColor: '#c8b898',
	}, { collapsed: true });

	const { gravity } = useControls('Physics', {
		gravity: { value: -30, min: -60, max: -5, step: 1 },
	}, { collapsed: true });

	const { bloomIntensity, bloomThreshold, bloomSmoothing, bloomRadius, vignetteOffset, vignetteDarkness } =
		useControls('Post Processing', {
			bloomIntensity: { value: 5, min: 0, max: 10, step: 0.05 },
			bloomThreshold: { value: 1.0, min: 0, max: 2, step: 0.05 },
			bloomSmoothing: { value: 0.3, min: 0, max: 1, step: 0.05 },
			bloomRadius: { value: 0.8, min: 0, max: 1, step: 0.05 },
			vignetteOffset: { value: 0.3, min: 0, max: 1, step: 0.05 },
			vignetteDarkness: { value: 0.6, min: 0, max: 1, step: 0.05 },
		}, { collapsed: true });

	return (
		<>
			<color attach="background" args={[background]} />
			<fogExp2 attach="fog" args={[fogColor, fogDensity]} />
			<ambientLight intensity={ambientIntensity} />
			<directionalLight
				ref={directionalLightRef}
				castShadow
				position={sunPosition}
				intensity={sunIntensity}
				shadow-mapSize-width={4096}
				shadow-mapSize-height={4096}
				shadow-camera-left={-60}
				shadow-camera-right={60}
				shadow-camera-top={60}
				shadow-camera-bottom={-60}
				shadow-camera-near={0.5}
				shadow-camera-far={sunDistance * 2}
				shadow-radius={shadowRadius}
			/>
			<Sun position={sunPosition} size={sunSize} groupRef={sunGroupRef} />
			<Physics gravity={[0, gravity, 0]}>
				<RepeatingGround
					heightMap={heightMap}
					heightScale={heightScale}
					colorSteps={[colorStep2, colorStep3]}
				/>
				<Ground
					heightMap={heightMap}
					subdivisions={subdivisions}
					heightScale={heightScale}
					colorSteps={[colorStep2, colorStep3]}
				/>
				<SandstormBarrier />
				<Obstacles />
				<Player
					rigidBodyRef={playerRef}
					meshRef={playerMeshRef}
					yawRef={yawRef}
					sunPositionRef={sunPositionRef}
				/>
				<ThirdPersonCamera target={playerMeshRef} yawRef={yawRef} heightMap={heightMap} heightScale={heightScale} />
			</Physics>
			<DesertVegetation heightMap={heightMap} heightScale={heightScale} />
			<EffectComposer>
				<Bloom
					mipmapBlur
					intensity={bloomIntensity}
					luminanceThreshold={bloomThreshold}
					luminanceSmoothing={bloomSmoothing}
					radius={bloomRadius}
				/>
				<Vignette offset={vignetteOffset} darkness={vignetteDarkness} />
			</EffectComposer>
			<Minimap />
		</>
	);
}

export default function App() {
	useEffect(() => {
		const onDblClick = () => {
			if (document.pointerLockElement) return;
			if (document.fullscreenElement) {
				document.exitFullscreen();
			} else {
				document.documentElement.requestFullscreen();
			}
		};

		document.addEventListener('dblclick', onDblClick);
		return () => document.removeEventListener('dblclick', onDblClick);
	}, []);

	return (
		<>
			<Leva collapsed={false} />
			<Canvas shadows>
				<Stats />
				<Scene />
			</Canvas>
			<div className="minimap-frame" />
		</>
	);
}
