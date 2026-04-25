import { useEffect, useRef } from 'react';
import { gameState } from './gameState';
import { formatRaceTime } from './formatRaceTime';
import './Hud.css';

const FLAME_COUNT = 10;

export function Hud() {
	const healthFillRef = useRef<HTMLDivElement>(null);
	const healthTextRef = useRef<HTMLSpanElement>(null);
	const flameContainerRef = useRef<HTMLDivElement>(null);
	const healthGlowRef = useRef<HTMLDivElement>(null);
	const timerRef = useRef<HTMLSpanElement>(null);
	const progressValueRef = useRef<HTMLSpanElement>(null);
	const progressFillRef = useRef<HTMLDivElement>(null);
	const hudRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let rafId: number;
		let prevHealth = gameState.health;
		// -1 forces a DOM write on the first frame regardless of the
		// initial gameState.progress value.
		let prevProgressPct = -1;

		const update = () => {
			const fill = healthFillRef.current;
			const text = healthTextRef.current;
			const flames = flameContainerRef.current;
			const glow = healthGlowRef.current;
			const timer = timerRef.current;
			const progressValue = progressValueRef.current;
			const progressFill = progressFillRef.current;

			if (fill && text && flames && glow) {
				const pct = (gameState.health / gameState.maxHealth) * 100;
				fill.style.width = `${pct}%`;
				text.textContent = `${Math.ceil(gameState.health)}`;

				flames.style.left = `${pct}%`;
				glow.style.left = `calc(${pct}% - 12px)`;

				const losing = gameState.health < prevHealth && gameState.health > 0;
				flames.classList.toggle('active', losing);
				glow.classList.toggle('active', losing);
				fill.classList.toggle('taking-damage', losing);

				prevHealth = gameState.health;
			}

			if (timer) {
				const elapsed = gameState.phase === 'running' || gameState.phase === 'finished'
					? (gameState.raceEndTime ?? performance.now()) - gameState.raceStartTime
					: 0;
				timer.textContent = formatRaceTime(elapsed);
			}

			if (progressValue && progressFill) {
				const pct = Math.round(gameState.progress * 100);
				if (pct !== prevProgressPct) {
					progressValue.textContent = `${pct}%`;
					progressFill.style.width = `${pct}%`;
					prevProgressPct = pct;
				}
			}

			rafId = requestAnimationFrame(update);
		};

		rafId = requestAnimationFrame(update);
		return () => cancelAnimationFrame(rafId);
	}, []);

	return (
		<div ref={hudRef} className="hud">
			{/* Top-left: Race position */}
			<div className="hud-panel hud-position">
				<span className="hud-position-number">1</span>
				<span className="hud-position-suffix">ST</span>
				<span className="hud-position-label">PLACE</span>
			</div>

			{/* Top-center: Race timer */}
			<div className="hud-panel hud-timer">
				<span className="hud-timer-value" ref={timerRef}>00:00:00</span>
			</div>

			{/* Top-right: Progress */}
			<div className="hud-panel hud-progress">
				<div className="hud-progress-header">
					<span className="hud-progress-label">DISTANCE</span>
					<span className="hud-progress-value" ref={progressValueRef}>0%</span>
				</div>
				<div className="hud-progress-track">
					<div className="hud-progress-fill" ref={progressFillRef} style={{ width: '0%' }} />
				</div>
			</div>

			{/* Bottom-left: Health bar */}
			<div className="hud-panel hud-health">
				<div className="hud-health-header">
					<span className="hud-health-label">HEALTH</span>
					<span className="hud-health-value" ref={healthTextRef}>100</span>
				</div>
				<div className="hud-health-track">
					<div className="hud-health-fill" ref={healthFillRef}>
						<div className="hud-health-fill-sheen" />
					</div>
					<div className="hud-health-glow" ref={healthGlowRef} />
					<div className="hud-health-flames" ref={flameContainerRef}>
						{Array.from({ length: FLAME_COUNT }, (_, i) => (
							<div key={i} className={`flame flame-${i}`} />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
