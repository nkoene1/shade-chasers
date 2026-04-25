export function formatRaceTime(ms: number): string {
	if (ms < 0) ms = 0;
	const totalCs = Math.floor(ms / 10);
	const cs = totalCs % 100;
	const totalS = Math.floor(totalCs / 100);
	const s = totalS % 60;
	const m = Math.floor(totalS / 60);
	const mm = m.toString().padStart(2, '0');
	const ss = s.toString().padStart(2, '0');
	const cc = cs.toString().padStart(2, '0');
	return `${mm}:${ss}:${cc}`;
}
