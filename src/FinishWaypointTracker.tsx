import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { gameState } from './gameState';

const SCREEN_EDGE_PADDING_NDC = 0.92;

function clampProjectedPoint(x: number, y: number, inFront: boolean): { x: number; y: number } {
	let ndcX = x;
	let ndcY = y;

	if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) {
		return { x: 0, y: -SCREEN_EDGE_PADDING_NDC };
	}

	if (!inFront) {
		ndcX = -ndcX;
		ndcY = -ndcY;
		if (Math.abs(ndcX) < 0.001 && Math.abs(ndcY) < 0.001) {
			ndcY = -1;
		}
	}

	const maxAbs = Math.max(Math.abs(ndcX), Math.abs(ndcY), SCREEN_EDGE_PADDING_NDC);
	if (maxAbs > SCREEN_EDGE_PADDING_NDC) {
		const scale = SCREEN_EDGE_PADDING_NDC / maxAbs;
		ndcX *= scale;
		ndcY *= scale;
	}

	return { x: ndcX, y: ndcY };
}

export function FinishWaypointTracker() {
	const { camera, size } = useThree();
	const finishPosition = useMemo(() => new THREE.Vector3(), []);
	const projected = useMemo(() => new THREE.Vector3(), []);
	const cameraDirection = useMemo(() => new THREE.Vector3(), []);
	const toFinish = useMemo(() => new THREE.Vector3(), []);

	useFrame(() => {
		finishPosition.set(gameState.finishX, gameState.finishY, gameState.finishZ);
		projected.copy(finishPosition).project(camera);

		camera.getWorldDirection(cameraDirection);
		toFinish.subVectors(finishPosition, camera.position);
		const inFront = cameraDirection.dot(toFinish) > 0;
		const clamped = clampProjectedPoint(projected.x, projected.y, inFront);

		gameState.finishWaypointScreenX = (clamped.x * 0.5 + 0.5) * size.width;
		gameState.finishWaypointScreenY = (-clamped.y * 0.5 + 0.5) * size.height;

		const dirX = cameraDirection.x;
		const dirZ = cameraDirection.z;
		const dirLenSq = dirX * dirX + dirZ * dirZ;
		if (dirLenSq <= 0.0001) {
			gameState.finishWaypointFocused = false;
			return;
		}

		const dx = gameState.finishX - camera.position.x;
		const dz = gameState.finishZ - camera.position.z;
		const t = (dx * dirX + dz * dirZ) / dirLenSq;
		const closestX = camera.position.x + dirX * t;
		const closestZ = camera.position.z + dirZ * t;
		const missX = gameState.finishX - closestX;
		const missZ = gameState.finishZ - closestZ;

		gameState.finishWaypointFocused = t > 0 && missX * missX + missZ * missZ <= gameState.finishRadius * gameState.finishRadius;
	});

	return null;
}
