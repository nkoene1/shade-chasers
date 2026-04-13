import { useFrame, useThree } from '@react-three/fiber';
import { useControls } from 'leva';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TERRAIN_SIZE } from './useHeightMap';

export function Minimap() {
	const { gl, scene } = useThree();

	const { size, margin, cameraHeight, opacity } = useControls('Minimap', {
		size: { value: 240, min: 80, max: 400, step: 10, label: 'Size (px)' },
		margin: { value: 16, min: 0, max: 60, step: 2, label: 'Distance (px)' },
		cameraHeight: { value: 200, min: 50, max: 500, step: 10, label: 'Camera Height' },
		opacity: { value: 1, min: 0.2, max: 1, step: 0.05 },
	}, { collapsed: true });

	useEffect(() => {
		const root = document.documentElement;
		root.style.setProperty('--minimap-size', `${size}px`);
		root.style.setProperty('--minimap-margin', `${margin}px`);
		root.style.setProperty('--minimap-opacity', `${opacity}`);
	}, [size, margin, opacity]);

	const camera = useMemo(() => {
		const half = TERRAIN_SIZE / 2;
		const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 1000);
		cam.position.set(0, cameraHeight, 0);
		cam.lookAt(0, 0, 0);
		return cam;
	}, [cameraHeight]);

	const clearColor = useMemo(() => new THREE.Color('#1a1a2e'), []);
	const _scissor = useMemo(() => new THREE.Vector4(), []);
	const _viewport = useMemo(() => new THREE.Vector4(), []);
	const _clearColor = useMemo(() => new THREE.Color(), []);

	useFrame(() => {
		const dpr = gl.getPixelRatio();
		const cw = gl.domElement.width;
		const mapSize = Math.round(size * dpr);
		const mapMargin = Math.round(margin * dpr);

		const x = cw - mapSize - mapMargin;
		const y = mapMargin;

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
