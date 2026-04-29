import { useFrame, useThree } from '@react-three/fiber';
import { useControls } from 'leva';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { gameState } from './gameState';
import { TERRAIN_SIZE } from './useHeightMap';

function hudEdgeInsetCssPixels(): number {
	const raw = getComputedStyle(document.documentElement).getPropertyValue('--hud-edge-inset').trim();
	const n = parseFloat(raw);
	return Number.isFinite(n) ? n : 24;
}

export function Minimap() {
	const { gl, scene } = useThree();

	const { size, cameraHeight, opacity } = useControls('Minimap', {
		size: { value: 240, min: 80, max: 400, step: 10, label: 'Size (px)' },
		cameraHeight: { value: 200, min: 50, max: 500, step: 10, label: 'Camera Height' },
		opacity: { value: 1, min: 0.2, max: 1, step: 0.05 },
	}, { collapsed: true });

	useEffect(() => {
		const root = document.documentElement;
		root.style.setProperty('--minimap-size', `${size}px`);
		root.style.setProperty('--minimap-opacity', `${opacity}`);
	}, [size, opacity]);

	const camera = useMemo(() => {
		const half = TERRAIN_SIZE / 2;
		const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 1000);
		cam.position.set(0, cameraHeight, 0);
		cam.lookAt(0, 0, 0);
		return cam;
	}, [cameraHeight]);

	const clearColor = useMemo(() => new THREE.Color('#1a1a2e'), []);
	const finishPosition = useMemo(() => new THREE.Vector3(), []);
	const finishProjected = useMemo(() => new THREE.Vector3(), []);
	const playerPosition = useMemo(() => new THREE.Vector3(), []);
	const playerProjected = useMemo(() => new THREE.Vector3(), []);
	const _scissor = useMemo(() => new THREE.Vector4(), []);
	const _viewport = useMemo(() => new THREE.Vector4(), []);
	const _clearColor = useMemo(() => new THREE.Color(), []);

	useFrame(() => {
		const dpr = gl.getPixelRatio();
		const cw = gl.domElement.width;
		const mapSize = Math.round(size * dpr);
		const edgeInsetPx = hudEdgeInsetCssPixels();
		const mapMargin = Math.round(edgeInsetPx * dpr);

		const x = cw - mapSize - mapMargin;
		const y = mapMargin;

		camera.updateMatrixWorld();
		finishPosition.set(gameState.finishX, gameState.finishY, gameState.finishZ);
		finishProjected.copy(finishPosition).project(camera);
		gameState.finishMinimapScreenX = x / dpr + (finishProjected.x * 0.5 + 0.5) * size;
		gameState.finishMinimapScreenY = gl.domElement.clientHeight - edgeInsetPx - size + (-finishProjected.y * 0.5 + 0.5) * size;

		playerPosition.set(gameState.playerX, gameState.playerY, gameState.playerZ);
		playerProjected.copy(playerPosition).project(camera);
		gameState.playerMinimapScreenX = x / dpr + (playerProjected.x * 0.5 + 0.5) * size;
		gameState.playerMinimapScreenY = gl.domElement.clientHeight - edgeInsetPx - size + (-playerProjected.y * 0.5 + 0.5) * size;

		const prevScissorTest = gl.getScissorTest();
		gl.getScissor(_scissor);
		gl.getViewport(_viewport);
		const prevAutoClear = gl.autoClear;
		gl.getClearColor(_clearColor);
		const prevClearAlpha = gl.getClearAlpha();

		gl.autoClear = false;
		gl.setScissorTest(true);
		gl.setScissor(x, y, mapSize, mapSize);
		gl.setViewport(x, y, mapSize, mapSize);
		gl.setClearColor(clearColor, 1);
		gl.clear(true, true, false);
		const prevFog = scene.fog;
		scene.fog = null;
		gl.render(scene, camera);
		scene.fog = prevFog;

		gl.autoClear = prevAutoClear;
		gl.setClearColor(_clearColor, prevClearAlpha);
		gl.setScissorTest(prevScissorTest);
		gl.setScissor(_scissor);
		gl.setViewport(_viewport);
	}, 2);

	return null;
}
