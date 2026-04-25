const ADJECTIVES = ['Dusty', 'Swift', 'Quiet', 'Faded', 'Broken', 'Lost', 'Pale', 'Hot', 'Cold', 'Grey'] as const;
const NOUNS = ['Drifter', 'Shadow', 'Runner', 'Nomad', 'Stray', 'Walker', 'Ghost', 'Scout', 'Sage', 'Wanderer'] as const;

export function randomPlayerName(): string {
	const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	const suffix = Math.floor(Math.random() * 900 + 100);
	return `${adjective}${noun}${suffix}`;
}
