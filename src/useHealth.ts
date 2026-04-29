import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef } from 'react';
import { gameState } from './gameState';

export function useHealth(inShadowRef: React.RefObject<boolean>) {
	const { sunDamageEnabled, drainRate, regenRate } = useControls(
		'Health',
		{
			sunDamageEnabled: { value: true, label: 'Sun Damage' },
			drainRate: { value: 16, min: 1, max: 40, step: 1, label: 'Drain / sec' },
			regenRate: { value: 6, min: 0.5, max: 20, step: 0.5, label: 'Regen / sec' },
		},
		{ collapsed: true },
	);

	const deadRef = useRef(false);

	useFrame((_, delta) => {
		if (gameState.phase !== 'running') {
			gameState.health = gameState.maxHealth;
			gameState.isDraining = false;
			gameState.isDead = false;
			deadRef.current = false;
			gameState.inShadow = inShadowRef.current;
			return;
		}

		if (deadRef.current) {
			gameState.isDraining = false;
			return;
		}

		const inShadow = inShadowRef.current;
		gameState.inShadow = inShadow;

		if (sunDamageEnabled && !inShadow && gameState.health > 0) {
			gameState.health = Math.max(0, gameState.health - drainRate * delta);
			gameState.isDraining = true;
		} else if (inShadow && gameState.health < gameState.maxHealth) {
			gameState.health = Math.min(gameState.maxHealth, gameState.health + regenRate * delta);
			gameState.isDraining = false;
		} else {
			gameState.isDraining = false;
		}

		if (gameState.health <= 0) {
			gameState.health = 0;
			gameState.isDraining = false;
			gameState.isDead = true;
			deadRef.current = true;
			gameState.onPlayerDeath?.();
		}
	});

	return deadRef;
}
