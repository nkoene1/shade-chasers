import type { RefObject } from 'react';
import { useMemo } from 'react';
import * as THREE from 'three';

interface SunProps {
	position: [number, number, number];
	size: number;
	groupRef?: RefObject<THREE.Group | null>;
}

function createDiscTexture(): THREE.CanvasTexture {
	const res = 256;
	const canvas = document.createElement('canvas');
	canvas.width = res;
	canvas.height = res;
	const ctx = canvas.getContext('2d')!;

	const gradient = ctx.createRadialGradient(
		res / 2, res / 2, 0,
		res / 2, res / 2, res / 2,
	);
	gradient.addColorStop(0, 'rgba(255, 240, 180, 1)');
	gradient.addColorStop(0.7, 'rgba(253, 184, 19, 1)');
	gradient.addColorStop(0.85, 'rgba(253, 184, 19, 0.4)');
	gradient.addColorStop(1, 'rgba(253, 184, 19, 0)');

	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, res, res);

	return new THREE.CanvasTexture(canvas);
}

function createGlowTexture(): THREE.CanvasTexture {
	const res = 256;
	const canvas = document.createElement('canvas');
	canvas.width = res;
	canvas.height = res;
	const ctx = canvas.getContext('2d')!;

	const gradient = ctx.createRadialGradient(
		res / 2, res / 2, 0,
		res / 2, res / 2, res / 2,
	);
	gradient.addColorStop(0, 'rgba(255, 220, 100, 0.8)');
	gradient.addColorStop(0.2, 'rgba(255, 200, 80, 0.4)');
	gradient.addColorStop(0.5, 'rgba(255, 160, 40, 0.1)');
	gradient.addColorStop(1, 'rgba(255, 120, 0, 0)');

	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, res, res);

	return new THREE.CanvasTexture(canvas);
}

export function Sun({ position, size, groupRef }: SunProps) {
	const discTexture = useMemo(() => createDiscTexture(), []);
	const glowTexture = useMemo(() => createGlowTexture(), []);
	const discScale = size * 2;
	const glowScale = size * 8;

	return (
		<group ref={groupRef} position={position}>
			<sprite scale={[discScale, discScale, 1]} renderOrder={1}>
				<spriteMaterial
					map={discTexture}
					color={[4, 3.5, 2]}
					toneMapped={false}
					transparent
					depthWrite={false}
				/>
			</sprite>
			<sprite scale={[glowScale, glowScale, 1]} renderOrder={0}>
				<spriteMaterial
					map={glowTexture}
					color={[3, 2.5, 1.5]}
					toneMapped={false}
					transparent
					depthWrite={false}
					blending={THREE.AdditiveBlending}
				/>
			</sprite>
		</group>
	);
}
