import { useEffect, useRef, useState } from 'react';
import './Countdown.css';

interface CountdownProps {
	/**
	 * Called the moment "START!" appears on screen (t = 3000 ms).
	 * Gameplay should begin immediately when this fires — the component
	 * stays mounted briefly afterwards to play the "START!" flourish.
	 */
	onGo: () => void;
	/**
	 * Called after the "START!" flourish has finished playing and the
	 * component is ready to be unmounted by the parent. The parent must
	 * keep this component mounted until this fires — gating its mount on
	 * `phase === 'countdown'` would unmount it the same tick `onGo`
	 * transitions to `running`, skipping the "START!" render entirely.
	 */
	onDone: () => void;
}

const STEP_MS = 1000;
const GO_EXIT_MS = 900;

type Step = {
	value: '3' | '2' | '1' | 'GO!';
	ariaLabel: string;
};

const STEPS: Step[] = [
	{ value: '3', ariaLabel: '3' },
	{ value: '2', ariaLabel: '2' },
	{ value: '1', ariaLabel: '1' },
	{ value: 'GO!', ariaLabel: 'Go' },
];

export function Countdown({ onGo, onDone }: CountdownProps) {
	const [stepIndex, setStepIndex] = useState(0);
	const [done, setDone] = useState(false);

	// Stash callbacks in refs so the timer effect below can be listed with an
	// empty dependency array. If we depended on `onGo` directly, the parent's
	// `setPhase('running')` inside onGo would re-render App, which would pass
	// us a fresh onGo closure, invalidating the effect's deps — React would
	// tear down the in-flight timeouts and restart the whole 3→2→1→START
	// sequence. Same reasoning for onDone.
	const onGoRef = useRef(onGo);
	const onDoneRef = useRef(onDone);
	onGoRef.current = onGo;
	onDoneRef.current = onDone;

	useEffect(() => {
		const timeouts: number[] = [];

		timeouts.push(
			window.setTimeout(() => setStepIndex(1), STEP_MS),
			window.setTimeout(() => setStepIndex(2), STEP_MS * 2),
			window.setTimeout(() => {
				setStepIndex(3);
				onGoRef.current();
			}, STEP_MS * 3),
			window.setTimeout(() => setDone(true), STEP_MS * 3 + GO_EXIT_MS),
		);

		return () => timeouts.forEach((id) => window.clearTimeout(id));
	}, []);

	useEffect(() => {
		if (done) onDoneRef.current();
	}, [done]);

	if (done) return null;

	const step = STEPS[stepIndex];
	const isGo = step.value === 'GO!';

	return (
		<div className="countdown" role="status" aria-live="polite">
			<div
				key={stepIndex}
				className={`countdown-step${isGo ? ' countdown-step--go' : ''}`}
				aria-label={step.ariaLabel}
			>
				<span className="countdown-step-text">{step.value}</span>
			</div>
		</div>
	);
}
