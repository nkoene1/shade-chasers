const NAME_STORAGE_KEY = 'shade-chasers-player-name';
const USER_STORAGE_KEY = 'shade-chasers-user';

export type StoredPlayerIdentity = {
	id: string;
	name: string;
};

function isStoredPlayerIdentity(value: unknown): value is StoredPlayerIdentity {
	if (typeof value !== 'object' || value == null) return false;
	const candidate = value as { id?: unknown; name?: unknown };
	return typeof candidate.id === 'string' && candidate.id.trim() !== ''
		&& typeof candidate.name === 'string' && candidate.name.trim() !== '';
}

export function loadStoredPlayerIdentity(): StoredPlayerIdentity | null {
	try {
		const stored = localStorage.getItem(USER_STORAGE_KEY);
		if (!stored) return null;
		const parsed = JSON.parse(stored) as unknown;
		if (!isStoredPlayerIdentity(parsed)) return null;
		return {
			id: parsed.id.trim(),
			name: parsed.name.trim(),
		};
	} catch {
		/* ignore */
	}
	return null;
}

export function savePlayerIdentity(user: StoredPlayerIdentity) {
	try {
		localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({
			id: user.id,
			name: user.name,
		}));
	} catch {
		/* ignore */
	}
}

export function loadStoredPlayerName(): string | null {
	const identity = loadStoredPlayerIdentity();
	if (identity) return identity.name;

	try {
		const stored = localStorage.getItem(NAME_STORAGE_KEY);
		if (stored && stored.trim()) return stored.trim();
	} catch {
		/* ignore */
	}
	return null;
}

export function savePlayerName(name: string) {
	try {
		localStorage.setItem(NAME_STORAGE_KEY, name);
	} catch {
		/* ignore */
	}
}
