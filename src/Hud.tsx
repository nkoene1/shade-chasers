import { useEffect, useRef } from 'react';
import { gameState } from './gameState';
import { formatRaceTime } from './formatRaceTime';
import { fetchTopScores, isScoreboardConfigured } from './scoreboardApi';
import './Hud.css';

const FLAME_COUNT = 10;
const SCOREBOARD_RANK_LIMIT = 10;

function hypotheticalRank(elapsedMs: number, scoreTimes: number[]): number | 'too slow' {
	for (let i = 0; i < scoreTimes.length; i++) {
		if (elapsedMs < scoreTimes[i]) return i + 1;
	}

	return scoreTimes.length === 0 ? 1 : 'too slow';
}

function ordinalSuffix(rank: number): string {
	const lastTwoDigits = rank % 100;
	if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return 'TH';

	switch (rank % 10) {
		case 1:
			return 'ST';
		case 2:
			return 'ND';
		case 3:
			return 'RD';
		default:
			return 'TH';
	}
}

export function Hud() {
	const healthFillRef = useRef<HTMLDivElement>(null);
	const healthTextRef = useRef<HTMLSpanElement>(null);
	const flameContainerRef = useRef<HTMLDivElement>(null);
	const healthGlowRef = useRef<HTMLDivElement>(null);
	const timerRef = useRef<HTMLSpanElement>(null);
	const positionPanelRef = useRef<HTMLDivElement>(null);
	const positionNumberRef = useRef<HTMLSpanElement>(null);
	const positionSuffixRef = useRef<HTMLSpanElement>(null);
	const positionLabelRef = useRef<HTMLSpanElement>(null);
	const progressValueRef = useRef<HTMLSpanElement>(null);
	const progressFillRef = useRef<HTMLDivElement>(null);
	const hudRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let rafId: number;
		let cancelled = false;
		let prevHealth = gameState.health;
		// -1 forces a DOM write on the first frame regardless of the
		// initial gameState.progress value.
		let prevProgressPct = -1;
		let prevPositionValue = '';
		let prevPhase = gameState.phase;
		const scoreTimesRef = { current: [] as number[] };

		const loadScoreTimes = async () => {
			if (!isScoreboardConfigured()) {
				scoreTimesRef.current = [];
				return;
			}

			try {
				const rows = await fetchTopScores();
				if (cancelled) return;
				scoreTimesRef.current = rows
					.map((row) => row.finish_time_ms)
					.sort((a, b) => a - b)
					.slice(0, SCOREBOARD_RANK_LIMIT);
			} catch {
				if (!cancelled) scoreTimesRef.current = [];
			}
		};

		void loadScoreTimes();

		const update = () => {
			const fill = healthFillRef.current;
			const text = healthTextRef.current;
			const flames = flameContainerRef.current;
			const glow = healthGlowRef.current;
			const timer = timerRef.current;
			const positionPanel = positionPanelRef.current;
			const positionNumber = positionNumberRef.current;
			const positionSuffix = positionSuffixRef.current;
			const positionLabel = positionLabelRef.current;
			const progressValue = progressValueRef.current;
			const progressFill = progressFillRef.current;
			const phase = gameState.phase;

			if (phase === 'pre-round' && prevPhase !== 'pre-round') {
				void loadScoreTimes();
			}
			prevPhase = phase;

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

			if (timer || positionNumber) {
				const elapsed = phase === 'running' || phase === 'finished'
					? (gameState.raceEndTime ?? performance.now()) - gameState.raceStartTime
					: 0;
				if (timer) timer.textContent = formatRaceTime(elapsed);
				if (positionNumber && positionSuffix && positionLabel) {
					const positionValue = hypotheticalRank(elapsed, scoreTimesRef.current);
					const nextPositionValue = String(positionValue);
					if (nextPositionValue !== prevPositionValue) {
						const tooSlow = positionValue === 'too slow';
						positionPanel?.classList.toggle('hud-position--too-slow', tooSlow);
						positionNumber.textContent = tooSlow ? 'too' : String(positionValue);
						positionSuffix.textContent = tooSlow ? 'slow' : ordinalSuffix(positionValue);
						positionLabel.textContent = tooSlow ? '' : 'PLACE';
						prevPositionValue = nextPositionValue;
					}
				}
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
		return () => {
			cancelled = true;
			cancelAnimationFrame(rafId);
		};
	}, []);

	return (
		<div ref={hudRef} className="hud">
			{/* Top-left: Race position */}
			<div className="hud-panel hud-position" ref={positionPanelRef}>
				<span className="hud-position-number" ref={positionNumberRef}>1</span>
				<span className="hud-position-suffix" ref={positionSuffixRef}>ST</span>
				<span className="hud-position-label" ref={positionLabelRef}>PLACE</span>
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
