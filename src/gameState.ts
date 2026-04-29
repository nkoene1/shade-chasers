export type RoundPhase = 'pre-round' | 'countdown' | 'running' | 'finished';

export const gameState = {
	health: 100,
	maxHealth: 100,
	inShadow: false,
	isDraining: false,
	isDead: false,
	phase: 'pre-round' as RoundPhase,
	raceStartTime: 0,
	raceEndTime: null as number | null,
	playerX: 0,
	playerY: 0,
	playerZ: 0,
	playerMinimapScreenX: window.innerWidth,
	playerMinimapScreenY: window.innerHeight,
	// Distance-to-finish progress, 0..1. HUD reads this via rAF; writers only
	// touch it when the value actually changes.
	progress: 0,
	// Finish-line area pose, published by FinishArea. Defaults mirror its Leva
	// defaults so progress math is sane on the very first frame.
	finishX: 0,
	finishY: 0,
	finishZ: -45,
	finishRadius: 4,
	finishWaypointScreenX: window.innerWidth / 2,
	finishWaypointScreenY: window.innerHeight / 2,
	finishWaypointFocused: false,
	finishDistanceMeters: 0,
	finishMinimapScreenX: window.innerWidth,
	finishMinimapScreenY: window.innerHeight,
	/**
	 * Set from App while mounted. `useFinishLine` invokes this once per round
	 * when the player reaches the finish disk.
	 */
	onRoundFinish: null as null | ((elapsedMs: number) => void),
	/**
	 * Set from App while mounted. `useHealth` invokes this once per round when
	 * health reaches zero.
	 */
	onPlayerDeath: null as null | (() => void),
};

export function resetGameStateForPreRound() {
	gameState.health = gameState.maxHealth;
	gameState.isDraining = false;
	gameState.isDead = false;
	gameState.inShadow = false;
	gameState.raceEndTime = null;
	gameState.progress = 0;
	gameState.finishDistanceMeters = 0;
}
