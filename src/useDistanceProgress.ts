import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { useRef } from 'react';
import { gameState } from './gameState';
import { DEFAULT_DISTANCE } from './ThirdPersonCamera';
import { TERRAIN_SIZE } from './useHeightMap';

// Fixed spawn point — must match the Player RigidBody's initial position
// (Y is irrelevant for horizontal distance).
const SPAWN_X = 0;
const SPAWN_Z = TERRAIN_SIZE / 2 - DEFAULT_DISTANCE - 1;

// Progress refreshes 5×/sec — smooth enough for the HUD bar to feel live without
// paying the cost every rAF tick. The HUD reads `gameState.progress` each frame
// regardless; this only gates how often we re-sample the rigid body.
const CHECK_INTERVAL_S = 0.2;

function horizontalDistance(ax: number, az: number, bx: number, bz: number): number {
	const dx = ax - bx;
	const dz = az - bz;
	return Math.sqrt(dx * dx + dz * dz);
}

// Distance from a world point to the outer edge of the finish-line disk,
// clamped at 0 so points inside the disk report "at the finish".
function distanceToFinishEdge(x: number, z: number): number {
	const d = horizontalDistance(x, z, gameState.finishX, gameState.finishZ);
	return Math.max(d - gameState.finishRadius, 0);
}

/**
 * Tracks distance from the player to the finish-line area edge and writes a
 * 0..1 progress value to gameState. Samples every 200ms, and only writes when
 * the value actually changes. Progress is clamped to [0, 1] — moving further
 * from the finish than the spawn was keeps it pinned at 0, never negative.
 */
export function useDistanceProgress(
	rigidBodyRef: React.RefObject<RapierRigidBody | null>,
) {
	// Distance from the spawn point to the finish-line edge at round start.
	// Captured lazily on the first 'running' frame so any Leva tweaks to the
	// finish area made during pre-round are honored.
	const initialDistanceRef = useRef<number | null>(null);
	const sinceLastCheckRef = useRef(0);

	useFrame((_, delta) => {
		if (gameState.phase !== 'running') {
			initialDistanceRef.current = null;
			sinceLastCheckRef.current = 0;
			if (gameState.progress !== 0) gameState.progress = 0;
			return;
		}

		const rb = rigidBodyRef.current;
		if (!rb) return;

		if (initialDistanceRef.current === null) {
			initialDistanceRef.current = distanceToFinishEdge(SPAWN_X, SPAWN_Z);
			// Force an immediate first sample so the HUD doesn't wait a full
			// interval to leave 0% when the round starts.
			sinceLastCheckRef.current = CHECK_INTERVAL_S;
		}

		sinceLastCheckRef.current += delta;
		if (sinceLastCheckRef.current < CHECK_INTERVAL_S) return;
		sinceLastCheckRef.current = 0;

		const pos = rb.translation();
		const current = distanceToFinishEdge(pos.x, pos.z);
		const initial = initialDistanceRef.current;

		const raw = initial > 0 ? 1 - current / initial : 1;
		const progress = raw < 0 ? 0 : raw > 1 ? 1 : raw;

		if (progress !== gameState.progress) {
			gameState.progress = progress;
		}
	});
}
