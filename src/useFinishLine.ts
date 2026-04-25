import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { useRef } from 'react';
import { gameState } from './gameState';

/**
 * One-shot: when the player enters the finish disk (horizontal XZ distance ≤ radius),
 * calls the registered `gameState.onRoundFinish` with elapsed race time in ms.
 */
export function useFinishLine(rigidBodyRef: React.RefObject<RapierRigidBody | null>) {
	const firedThisRoundRef = useRef(false);

	useFrame(() => {
		if (gameState.phase !== 'running') {
			firedThisRoundRef.current = false;
			return;
		}
		if (firedThisRoundRef.current || gameState.isDead) return;

		const body = rigidBodyRef.current;
		if (!body) return;

		const t = body.translation();
		const dx = t.x - gameState.finishX;
		const dz = t.z - gameState.finishZ;
		const r = gameState.finishRadius;
		if (dx * dx + dz * dz > r * r) return;

		firedThisRoundRef.current = true;
		const elapsedMs = Math.max(0, performance.now() - gameState.raceStartTime);
		gameState.onRoundFinish?.(elapsedMs);
	});
}
