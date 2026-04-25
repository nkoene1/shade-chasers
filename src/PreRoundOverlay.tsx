import { useCallback, useEffect, useRef, useState } from 'react';
import { formatRaceTime } from './formatRaceTime';
import { loadStoredPlayerIdentity, loadStoredPlayerName, savePlayerIdentity, savePlayerName } from './playerNameStorage';
import {
	createUser,
	fetchTopScores,
	isScoreboardConfigured,
	ScoreboardNameTakenError,
	type ScoreboardUser,
	type ScoreRow,
} from './scoreboardApi';
import { randomPlayerName } from './randomPlayerName';
import './PreRoundOverlay.css';

const EXIT_DURATION_MS = 180;

interface PreRoundOverlayProps {
	onStart: (user: ScoreboardUser) => void;
}

export function PreRoundOverlay({ onStart }: PreRoundOverlayProps) {
	const [leaving, setLeaving] = useState(false);
	const hasStartedRef = useRef(false);
	const [storedIdentity, setStoredIdentity] = useState(() => loadStoredPlayerIdentity());
	const [playerName, setPlayerName] = useState(() => storedIdentity?.name ?? loadStoredPlayerName() ?? randomPlayerName());
	const [isStarting, setIsStarting] = useState(false);
	const [startError, setStartError] = useState<string | null>(null);
	const [scoreboardOpen, setScoreboardOpen] = useState(false);
	const [scores, setScores] = useState<ScoreRow[]>([]);
	const [scoresLoading, setScoresLoading] = useState(false);
	const [scoresError, setScoresError] = useState<string | null>(null);

	useEffect(() => {
		savePlayerName(playerName);
	}, [playerName]);

	const loadScores = useCallback(async () => {
		if (!isScoreboardConfigured()) {
			setScoresError('Scoreboard not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
			setScores([]);
			return;
		}
		setScoresLoading(true);
		setScoresError(null);
		try {
			const rows = await fetchTopScores();
			setScores(rows.slice(0, 10));
		} catch (e) {
			setScores([]);
			setScoresError(e instanceof Error ? e.message : 'Failed to load scores.');
		} finally {
			setScoresLoading(false);
		}
	}, []);

	useEffect(() => {
		if (scoreboardOpen) void loadScores();
	}, [scoreboardOpen, loadScores]);

	const handleStart = async () => {
		if (hasStartedRef.current || isStarting) return;

		const trimmed = playerName.trim() || randomPlayerName();
		setPlayerName(trimmed);
		savePlayerName(trimmed);

		if (!isScoreboardConfigured()) {
			setStartError('Scoreboard not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
			return;
		}

		setIsStarting(true);
		setStartError(null);
		try {
			const user = await createUser(trimmed, storedIdentity?.id);
			hasStartedRef.current = true;
			setStoredIdentity(user);
			setPlayerName(user.name);
			savePlayerIdentity(user);
			savePlayerName(user.name);
			setLeaving(true);
			window.setTimeout(() => onStart(user), EXIT_DURATION_MS);
		} catch (e) {
			if (e instanceof ScoreboardNameTakenError) {
				setStartError(e.message);
			} else {
				setStartError(e instanceof Error ? e.message : 'Could not create player. Check connection or server.');
			}
			setIsStarting(false);
		}
	};

	return (
		<div className={`preround${leaving ? ' preround--leaving' : ''}`}>
			<div className="preround-backdrop" />
			<div className="preround-content">
				<div className="preround-tagline">OUTRUN THE SUN</div>
				<h1 className="preround-title">SHADE CHASERS</h1>
				<div className="preround-subtitle">Stay in the shadows</div>

				<label className="preround-name-label" htmlFor="preround-player-name">
					Display name
				</label>
				<input
					id="preround-player-name"
					className="preround-name-input"
					type="text"
					maxLength={32}
					autoComplete="username"
					value={playerName}
					disabled={isStarting || leaving}
					onChange={(e) => {
						setPlayerName(e.target.value);
						setStartError(null);
					}}
				/>
				{startError != null && (
					<div className="preround-name-error" role="alert">
						{startError}
					</div>
				)}

				<div className="preround-actions">
					<button
						type="button"
						className="preround-start"
						onClick={handleStart}
						disabled={isStarting || leaving}
						autoFocus
					>
						<span className="preround-start-label">{isStarting ? 'CLAIMING' : 'START'}</span>
					</button>
					<button
						type="button"
						className="preround-secondary"
						onClick={() => setScoreboardOpen((o) => !o)}
						disabled={isStarting || leaving}
					>
						{scoreboardOpen ? 'Hide top 10' : 'Top 10'}
					</button>
				</div>

				{scoreboardOpen && (
					<div className="preround-scoreboard" aria-live="polite">
						<div className="preround-scoreboard-title">Global top 10 (fastest)</div>
						{scoresLoading && <div className="preround-scoreboard-status">Loading…</div>}
						{!scoresLoading && scoresError != null && (
							<div className="preround-scoreboard-error">{scoresError}</div>
						)}
						{!scoresLoading && scoresError == null && scores.length === 0 && (
							<div className="preround-scoreboard-empty">No scores yet.</div>
						)}
						{!scoresLoading && scoresError == null && scores.length > 0 && (
							<ol className="preround-scoreboard-list">
								{scores.map((row, i) => (
									<li key={row.id} className="preround-scoreboard-item">
										<span className="preround-scoreboard-rank">{i + 1}</span>
										<span className="preround-scoreboard-name" title={row.player_name}>
											{row.player_name}
										</span>
										<span className="preround-scoreboard-time">{formatRaceTime(row.finish_time_ms)}</span>
									</li>
								))}
							</ol>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
