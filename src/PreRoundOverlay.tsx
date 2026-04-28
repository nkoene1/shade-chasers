import { useControls } from 'leva';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatRaceTime } from './formatRaceTime';
import { loadStoredPlayerIdentity, loadStoredPlayerName, savePlayerIdentity, savePlayerName } from './playerNameStorage';
import './PreRoundOverlay.css';
import { randomPlayerName } from './randomPlayerName';
import {
	createUser,
	fetchTopScores,
	isScoreboardConfigured,
	ScoreboardNameTakenError,
	type ScoreboardUser,
	type ScoreRow,
} from './scoreboardApi';

const EXIT_DURATION_MS = 180;
const MENU_SOUNDTRACK_PATH = '/audio/menu-soundtrack.mp3';
const MENU_BACKGROUND_VIDEO_PATH = '/video/menu-background-video.mp4';
const MENU_BACKGROUND_VIDEO_REVERSE_PATH = '/video/menu-background-video-reverse.mp4';
const MENU_BACKGROUND_VIDEO_EASE_SECONDS = 0.8;
const MENU_BACKGROUND_VIDEO_MIN_PLAYBACK_RATE = 0.75;
const MENU_MUSIC_ON_STORAGE_KEY = 'shade-chasers-menu-music-on';

function loadStoredMenuMusicOn(): boolean | null {
	try {
		const raw = localStorage.getItem(MENU_MUSIC_ON_STORAGE_KEY);
		if (raw === 'true') return true;
		if (raw === 'false') return false;
	} catch {
		/* ignore */
	}
	return null;
}

function saveStoredMenuMusicOn(on: boolean) {
	try {
		localStorage.setItem(MENU_MUSIC_ON_STORAGE_KEY, on ? 'true' : 'false');
	} catch {
		/* ignore */
	}
}

interface PreRoundOverlayProps {
	onStart: (user: ScoreboardUser) => void;
}

export function PreRoundOverlay({ onStart }: PreRoundOverlayProps) {
	const { musicVolume } = useControls(
		'Menu Music',
		{
			musicVolume: { value: 0.10, min: 0, max: 1, step: 0.01, label: 'Volume' },
		},
		{ collapsed: true },
	);
	const [leaving, setLeaving] = useState(false);
	const hasStartedRef = useRef(false);
	const menuMusicRef = useRef<HTMLAudioElement | null>(null);
	const menuForwardVideoRef = useRef<HTMLVideoElement | null>(null);
	const menuReverseVideoRef = useRef<HTMLVideoElement | null>(null);
	const musicVolumeRef = useRef(musicVolume);
	const [storedIdentity, setStoredIdentity] = useState(() => loadStoredPlayerIdentity());
	const [playerName, setPlayerName] = useState(() => storedIdentity?.name ?? loadStoredPlayerName() ?? randomPlayerName());
	const [isStarting, setIsStarting] = useState(false);
	const [startError, setStartError] = useState<string | null>(null);
	const [scores, setScores] = useState<ScoreRow[]>([]);
	const [scoresLoading, setScoresLoading] = useState(false);
	const [scoresError, setScoresError] = useState<string | null>(null);
	const [menuMusicOn, setMenuMusicOn] = useState(() => loadStoredMenuMusicOn() ?? true);
	const [activeMenuVideo, setActiveMenuVideo] = useState<'forward' | 'reverse'>('forward');
	const menuMusicOnRef = useRef(menuMusicOn);
	const menuAudioCtlRef = useRef<
		| null
		| {
				tryPlay: () => Promise<void>;
				stop: () => void;
		  }
	>(null);

	useEffect(() => {
		savePlayerName(playerName);
	}, [playerName]);

	useEffect(() => {
		musicVolumeRef.current = musicVolume;
		const audio = menuMusicRef.current;
		if (audio) audio.volume = musicVolume;
	}, [musicVolume]);

	useEffect(() => {
		menuMusicOnRef.current = menuMusicOn;
	}, [menuMusicOn]);

	useEffect(() => {
		const previous = menuMusicRef.current;
		if (previous) {
			previous.pause();
			previous.src = '';
			menuMusicRef.current = null;
		}

		menuAudioCtlRef.current = null;

		const audio = new Audio(MENU_SOUNDTRACK_PATH);
		audio.loop = true;
		audio.preload = 'auto';
		Object.assign(audio, { playsInline: true });
		audio.volume = musicVolumeRef.current;
		menuMusicRef.current = audio;

		let playbackStarted = false;

		const tryPlay = async () => {
			if (!menuMusicOnRef.current) {
				audio.pause();
				audio.currentTime = 0;
				playbackStarted = false;
				return;
			}

			audio.volume = musicVolumeRef.current;

			audio.muted = false;
			try {
				await audio.play();
				playbackStarted = true;
				return;
			} catch {
				//
			}

			audio.pause();
			audio.currentTime = 0;
			playbackStarted = false;
		};

		const stop = () => {
			audio.pause();
			audio.currentTime = 0;
			audio.muted = false;
			playbackStarted = false;
		};

		menuAudioCtlRef.current = { tryPlay, stop };

		const retryInterval = window.setInterval(() => {
			if (menuMusicRef.current !== audio || audio.ended) return;

			if (menuMusicOnRef.current && (!playbackStarted || audio.paused)) {
				void tryPlay();
			}
		}, 750);

		const onVisibility = () => {
			if (!document.hidden) void tryPlay();
		};

		window.addEventListener('visibilitychange', onVisibility);

		void tryPlay();

		return () => {
			window.clearInterval(retryInterval);
			window.removeEventListener('visibilitychange', onVisibility);
			audio.pause();
			audio.src = '';
			if (menuMusicRef.current === audio) menuMusicRef.current = null;
			menuAudioCtlRef.current = null;
		};
	}, []);

	useEffect(() => {
		const forwardVideo = menuForwardVideoRef.current;
		const reverseVideo = menuReverseVideoRef.current;
		if (!forwardVideo || !reverseVideo) return;

		let easingAnimationId = 0;

		const keepMuted = (video: HTMLVideoElement) => {
			if (!video.defaultMuted) video.defaultMuted = true;
			if (!video.muted) video.muted = true;
			if (video.volume !== 0) video.volume = 0;
		};

		const keepBothMuted = () => {
			keepMuted(forwardVideo);
			keepMuted(reverseVideo);
		};

		const easedPlaybackRate = (video: HTMLVideoElement) => {
			const duration = video.duration;
			if (!Number.isFinite(duration) || duration <= 0) return 1;

			const easeSeconds = Math.min(MENU_BACKGROUND_VIDEO_EASE_SECONDS, duration / 2);
			const secondsFromEdge = Math.min(video.currentTime, duration - video.currentTime);
			const progress = Math.max(0, Math.min(1, secondsFromEdge / easeSeconds));
			const easedProgress = progress * progress * (3 - 2 * progress);

			return MENU_BACKGROUND_VIDEO_MIN_PLAYBACK_RATE + (1 - MENU_BACKGROUND_VIDEO_MIN_PLAYBACK_RATE) * easedProgress;
		};

		const applyEasing = (video: HTMLVideoElement) => {
			video.playbackRate = easedPlaybackRate(video);
		};

		const updatePlaybackEasing = () => {
			keepBothMuted();
			if (!forwardVideo.paused) applyEasing(forwardVideo);
			if (!reverseVideo.paused) applyEasing(reverseVideo);
			easingAnimationId = window.requestAnimationFrame(updatePlaybackEasing);
		};

		const playVideo = async (video: HTMLVideoElement) => {
			keepMuted(video);
			applyEasing(video);

			try {
				await video.play();
			} catch {
				//
			}
		};

		const switchTo = (nextVideo: HTMLVideoElement, nextDirection: 'forward' | 'reverse') => {
			keepBothMuted();
			nextVideo.currentTime = 0;
			setActiveMenuVideo(nextDirection);
			void playVideo(nextVideo);
		};

		const handleForwardEnded = () => {
			forwardVideo.pause();
			switchTo(reverseVideo, 'reverse');
		};

		const handleReverseEnded = () => {
			reverseVideo.pause();
			switchTo(forwardVideo, 'forward');
		};

		const handleForwardLoadedData = () => {
			forwardVideo.currentTime = 0;
			void playVideo(forwardVideo);
		};

		forwardVideo.addEventListener('ended', handleForwardEnded);
		reverseVideo.addEventListener('ended', handleReverseEnded);
		forwardVideo.addEventListener('loadeddata', handleForwardLoadedData);
		forwardVideo.addEventListener('volumechange', keepBothMuted);
		reverseVideo.addEventListener('volumechange', keepBothMuted);

		keepBothMuted();
		reverseVideo.load();
		easingAnimationId = window.requestAnimationFrame(updatePlaybackEasing);
		if (forwardVideo.readyState >= 2) {
			void playVideo(forwardVideo);
		}

		return () => {
			window.cancelAnimationFrame(easingAnimationId);
			forwardVideo.removeEventListener('ended', handleForwardEnded);
			reverseVideo.removeEventListener('ended', handleReverseEnded);
			forwardVideo.removeEventListener('loadeddata', handleForwardLoadedData);
			forwardVideo.removeEventListener('volumechange', keepBothMuted);
			reverseVideo.removeEventListener('volumechange', keepBothMuted);
			forwardVideo.pause();
			reverseVideo.pause();
		};
	}, []);

	const handleToggleMenuMusic = useCallback(() => {
		setMenuMusicOn((prev) => {
			const next = !prev;
			menuMusicOnRef.current = next;
			saveStoredMenuMusicOn(next);
			queueMicrotask(() => {
				if (next) {
					void menuAudioCtlRef.current?.tryPlay();
				} else {
					menuAudioCtlRef.current?.stop();
				}
			});
			return next;
		});
	}, []);

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
		void loadScores();
	}, [loadScores]);

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
			<video
				ref={menuForwardVideoRef}
				className={`preround-background-video${activeMenuVideo === 'forward' ? '' : ' preround-background-video--hidden'}`}
				src={MENU_BACKGROUND_VIDEO_PATH}
				autoPlay
				muted
				playsInline
				preload="auto"
				aria-hidden="true"
			/>
			<video
				ref={menuReverseVideoRef}
				className={`preround-background-video${activeMenuVideo === 'reverse' ? '' : ' preround-background-video--hidden'}`}
				src={MENU_BACKGROUND_VIDEO_REVERSE_PATH}
				muted
				playsInline
				preload="auto"
				aria-hidden="true"
			/>
			<button
				type="button"
				className="preround-music-enable"
				onClick={handleToggleMenuMusic}
				disabled={isStarting || leaving}
				aria-pressed={menuMusicOn}
			>
				{menuMusicOn ? 'Menu music on' : 'Menu music off'}
			</button>
			<div className="preround-backdrop" />
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
						{isStarting && <span className="preround-start-spinner" aria-hidden="true" />}
						<span className="preround-start-label">{isStarting ? 'LOADING' : 'START'}</span>
					</button>
				</div>
			</div>
		</div>
	);
}
