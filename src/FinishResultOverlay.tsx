import { useMemo, useState } from 'react';
import { formatRaceTime } from './formatRaceTime';
import { savePlayerIdentity, savePlayerName } from './playerNameStorage';
import { createUser, isScoreboardConfigured, ScoreboardNameTakenError, submitScore } from './scoreboardApi';
import './FinishResultOverlay.css';

type FinishScoreStatus = 'idle' | 'saving' | 'success' | 'error' | 'name-taken' | 'unconfigured' | 'skipped';

interface FinishResultOverlayProps {
	finishTimeMs: number;
	userId: string;
	initialPlayerName: string;
	onBackToStart: () => void;
}

function statusMessage(status: FinishScoreStatus): string | null {
	switch (status) {
		case 'idle':
			return null;
		case 'saving':
			return 'Saving to global scoreboard...';
		case 'success':
			return 'Saved to global scoreboard.';
		case 'error':
			return 'Could not save score. Check connection or server.';
		case 'name-taken':
			return 'That display name is already taken.';
		case 'unconfigured':
			return 'Scoreboard not configured. Set VITE_SUPABASE_* in .env.local.';
		case 'skipped':
			return 'Score was not saved.';
	}
}

export function FinishResultOverlay({ finishTimeMs, userId, initialPlayerName, onBackToStart }: FinishResultOverlayProps) {
	const [playerName, setPlayerName] = useState(initialPlayerName);
	const [scoreStatus, setScoreStatus] = useState<FinishScoreStatus>('idle');
	const formattedTime = useMemo(() => formatRaceTime(finishTimeMs), [finishTimeMs]);
	const hasSaved = scoreStatus === 'success';
	const isSaving = scoreStatus === 'saving';

	const handleSave = () => {
		if (isSaving || hasSaved) return;

		if (!isScoreboardConfigured()) {
			setScoreStatus('unconfigured');
			return;
		}

		setScoreStatus('saving');
		const name = playerName.trim() || 'Runner';
		setPlayerName(name);
		savePlayerName(name);

		void createUser(name, userId)
			.then((user) => {
				savePlayerIdentity(user);
				savePlayerName(user.name);
				setPlayerName(user.name);
				return submitScore(user.id, finishTimeMs);
			})
			.then(() => setScoreStatus('success'))
			.catch((e) => {
				setScoreStatus(e instanceof ScoreboardNameTakenError ? 'name-taken' : 'error');
			});
	};

	const handleSkip = () => {
		if (isSaving || hasSaved) return;
		setScoreStatus('skipped');
	};

	return (
		<div className="finish-result" role="dialog" aria-modal="true" aria-labelledby="finish-result-title">
			<div className="finish-result-backdrop" />
			<div className="finish-result-card">
				<div className="finish-result-kicker">SHELTER REACHED</div>
				<h2 id="finish-result-title" className="finish-result-title">
					Survived
				</h2>
				<div className="finish-result-time-block" role="status">
					<span className="finish-result-time-label">Finish time</span>
					<span className="finish-result-time">{formattedTime}</span>
				</div>

				<label className="finish-result-name-label" htmlFor="finish-result-player-name">
					Display name
				</label>
				<input
					id="finish-result-player-name"
					className="finish-result-name-input"
					type="text"
					maxLength={32}
					autoComplete="username"
					value={playerName}
					disabled={isSaving || hasSaved}
					onChange={(e) => {
						setPlayerName(e.target.value);
						if (scoreStatus !== 'saving' && scoreStatus !== 'success') {
							setScoreStatus('idle');
						}
					}}
				/>

				<div className="finish-result-save-prompt">Save this run to the global scoreboard?</div>
				<div className="finish-result-save-actions">
					<button type="button" className="finish-result-primary" onClick={handleSave} disabled={isSaving || hasSaved}>
						{hasSaved ? 'Saved' : isSaving ? 'Saving...' : 'Save score'}
					</button>
					<button
						type="button"
						className="finish-result-secondary"
						onClick={handleSkip}
						disabled={isSaving || hasSaved}
					>
						Skip save
					</button>
				</div>

				{statusMessage(scoreStatus) != null && (
					<div className={`finish-result-status finish-result-status--${scoreStatus}`} aria-live="polite">
						{statusMessage(scoreStatus)}
					</div>
				)}

				<button type="button" className="finish-result-back" onClick={onBackToStart} disabled={isSaving}>
					Back to start
				</button>
			</div>
		</div>
	);
}
