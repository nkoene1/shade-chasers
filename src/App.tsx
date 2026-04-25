import { Stats } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import type { RapierRigidBody } from '@react-three/rapier';
import { Physics } from '@react-three/rapier';
import { button, Leva, useControls } from 'leva';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import './App.css';
import { Countdown } from './Countdown';
import { DesertVegetation } from './DesertVegetation';
import { FinishArea } from './FinishArea';
import { FinishResultOverlay } from './FinishResultOverlay';
import { gameState, resetGameStateForPreRound, type RoundPhase } from './gameState';
import { Ground } from './Ground';
import { Hud } from './Hud';
import { Minimap } from './Minimap';
import { Obstacles } from './Obstacles';
import { Player } from './Player';
import { PreRoundOverlay } from './PreRoundOverlay';
import { RepeatingGround } from './RepeatingGround';
import { SandstormBarrier } from './SandstormBarrier';
import type { ScoreboardUser } from './scoreboardApi';
import { Sun, SUN_LAYER } from './Sun';
import { ThirdPersonCamera, DEFAULT_DISTANCE } from './ThirdPersonCamera';
import { TERRAIN_SIZE, useHeightMap } from './useHeightMap';

const PLAYER_SPAWN: [number, number, number] = [0, 10, TERRAIN_SIZE / 2 - DEFAULT_DISTANCE - 1];

type FinishResult = {
	finishTimeMs: number;
	userId: string;
	playerName: string;
};

type SceneHandle = {
	/** Start the in-round sun movement once; safe to call on every non–pre-round phase. */
	startSunIfNeeded: () => void;
	/** Reset sun-timer / sun animation to the default pre-round configuration. */
	stopSun: () => void;
	/** Teleport the player to the initial spawn for the next round. */
	resetPlayerToSpawn: () => void;
};

// No `phase` prop: a prop change re-renders this entire subtree and re-runs every
// Leva `useControls` on the same frame as "START!" and `setPhase('running')` —
// a major source of jank. Ref + memo keeps phase transitions in 2D UI only.
const Scene = memo(
	forwardRef<SceneHandle>(function Scene(_props, ref) {
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

	// Sun starts slightly below the horizon (-15°) so the directional light's
	// position and the 4096² shadow-map frustum are already at the race-start
	// configuration during pre-round/countdown. Without this, the first timer
	// frame would snap the sun down to the starting angle, forcing a shadow-map
	// recompute and shader-variant compile for all casters newly inside the
	// lowered frustum — a ~tens-of-ms hitch at round start.
	const DEFAULT_SUN_ANGLE = -3;

	const [{ background, ambientIntensity, sunAngle, sunDirection, sunDistance, sunSize, sunIntensity, shadowRadius }, setLighting] =
		useControls('Lighting', () => ({
			background: '#87CEEB',
			ambientIntensity: { value: 0.4, min: 0, max: 2, step: 0.05 },
			sunAngle: { value: DEFAULT_SUN_ANGLE, min: DEFAULT_SUN_ANGLE, max: 90, step: 1, label: 'Sun Angle (-3%–90%)' },
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
		// Note: intentionally not calling setLighting({ sunAngle: 0 }) here.
		// useFrame below owns the light position while the timer runs, and a
		// Leva state write on the same tick as setPhase('running') would
		// trigger an extra Scene re-render (re-evaluating every useControls
		// hook) at the exact moment we're trying to keep cheap.
	}, []);

	const { timerDuration } = useControls('Sun Timer', {
		timerDuration: { value: 90, min: 10, max: 300, step: 5, label: 'Duration (s)' },
		'Start': button(startTimer, { disabled: timerRunning }),
		'Stop': button(stopTimer, { disabled: !timerRunning }),
	}, { collapsed: true }, [startTimer, stopTimer, timerRunning]);

	const timerDurationRef = useRef(timerDuration);
	timerDurationRef.current = timerDuration;

	useImperativeHandle(
		ref,
		() => ({
			startSunIfNeeded: () => {
				if (!timerRunningRef.current) startTimer();
			},
			stopSun: () => {
				stopTimer();
			},
			resetPlayerToSpawn: () => {
				const rb = playerRef.current;
				if (!rb) return;
				yawRef.current = Math.PI;
				const [x, y, z] = PLAYER_SPAWN;
				rb.setTranslation({ x, y, z }, true);
				rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
				rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
			},
		}),
		[startTimer, stopTimer],
	);

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
			const angle = DEFAULT_SUN_ANGLE + progress * (90 - DEFAULT_SUN_ANGLE);

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
				<FinishArea heightMap={heightMap} heightScale={heightScale} />
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
	}),
);

export default function App() {
	const sceneRef = useRef<SceneHandle>(null);
	const gameCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const [phase, setPhase] = useState<RoundPhase>('pre-round');
	// Decoupled from `phase` so the "START!" flourish can keep rendering for
	// ~900 ms after phase transitions to 'running'. Gating the Countdown on
	// phase alone unmounts it the same tick onGo fires (React 18 batches the
	// Countdown's internal setStepIndex(3) with the parent's setPhase), so the
	// 4th step never paints.
	const [countdownMounted, setCountdownMounted] = useState(false);
	const userLockedForRunRef = useRef<ScoreboardUser | null>(null);
	const [finishResult, setFinishResult] = useState<FinishResult | null>(null);
	const [deathMessageVisible, setDeathMessageVisible] = useState(false);

	const requestGamePointerLock = useCallback(() => {
		const canvas = gameCanvasRef.current;
		if (!canvas || document.pointerLockElement === canvas) return;

		const lockRequest = canvas.requestPointerLock();
		void lockRequest.catch?.(() => undefined);
	}, []);

	const handleRoundFinish = useCallback((elapsedMs: number) => {
		const rounded = Math.max(0, Math.round(elapsedMs));
		gameState.raceEndTime = gameState.raceStartTime + rounded;
		if (document.pointerLockElement) {
			document.exitPointerLock();
		}
		setDeathMessageVisible(false);
		sceneRef.current?.stopSun();
		const user = userLockedForRunRef.current;
		setFinishResult({
			finishTimeMs: rounded,
			userId: user?.id ?? '',
			playerName: user?.name.trim() || 'Runner',
		});
		setPhase('finished');
	}, []);

	const handlePlayerDeath = useCallback(() => {
		gameState.raceEndTime = performance.now();
		if (document.pointerLockElement) {
			document.exitPointerLock();
		}
		setDeathMessageVisible(true);
		sceneRef.current?.stopSun();
	}, []);

	const handleDeathReturnToStart = useCallback(() => {
		sceneRef.current?.resetPlayerToSpawn();
		resetGameStateForPreRound();
		setDeathMessageVisible(false);
		setPhase('pre-round');
	}, []);

	const handleFinishReturnToStart = useCallback(() => {
		sceneRef.current?.resetPlayerToSpawn();
		resetGameStateForPreRound();
		setFinishResult(null);
		setPhase('pre-round');
	}, []);

	useEffect(() => {
		gameState.onRoundFinish = handleRoundFinish;
		gameState.onPlayerDeath = handlePlayerDeath;
		return () => {
			gameState.onRoundFinish = null;
			gameState.onPlayerDeath = null;
		};
	}, [handleRoundFinish, handlePlayerDeath]);

	useEffect(() => {
		gameState.phase = phase;
		if (phase === 'running') {
			gameState.raceStartTime = performance.now();
			gameState.raceEndTime = null;
		}
	}, [phase]);

	useEffect(() => {
		if (phase === 'countdown' || phase === 'running') {
			sceneRef.current?.startSunIfNeeded();
		}
	}, [phase]);

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
			<Leva collapsed />
			<Canvas
				shadows
				onCreated={({ gl }) => {
					gameCanvasRef.current = gl.domElement;
				}}
			>
				<Stats />
				<Scene ref={sceneRef} />
			</Canvas>
			<Hud />
			<div className="minimap-frame" />
			<div className="minimap-label">MAP</div>
			{phase === 'pre-round' && (
				<PreRoundOverlay
					onStart={(user) => {
						requestGamePointerLock();
						setDeathMessageVisible(false);
						setFinishResult(null);
						userLockedForRunRef.current = user;
						setCountdownMounted(true);
						setPhase('countdown');
					}}
				/>
			)}
			{countdownMounted && (
				<Countdown
					onGo={() => setPhase('running')}
					onDone={() => setCountdownMounted(false)}
				/>
			)}
			{deathMessageVisible && (
				<div className="death-message" role="status" aria-live="assertive">
					<div className="death-message-card">
						<div className="death-message-kicker">EXPOSURE FATAL</div>
						<div className="death-message-title">You died</div>
						<div className="death-message-body">The sun got you. Stay in the shadows next run.</div>
						<button
							type="button"
							className="death-message-button"
							onClick={handleDeathReturnToStart}
							autoFocus
						>
							Back to start
						</button>
					</div>
				</div>
			)}
			{finishResult != null && (
				<FinishResultOverlay
					finishTimeMs={finishResult.finishTimeMs}
					userId={finishResult.userId}
					initialPlayerName={finishResult.playerName}
					onBackToStart={handleFinishReturnToStart}
				/>
			)}
		</>
	);
}
