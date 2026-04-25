const SCOREBOARD_PATH = '/functions/v1/scoreboard';

export type ScoreRow = {
	id: string;
	user_id: string;
	player_name: string;
	finish_time_ms: number;
	created_at: string;
};

export type ScoreboardUser = {
	id: string;
	name: string;
};

export class ScoreboardNameTakenError extends Error {
	constructor(message = 'That display name is already taken.') {
		super(message);
		this.name = 'ScoreboardNameTakenError';
	}
}

function getSupabaseConfig(): { baseUrl: string; anonKey: string } | null {
	const baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
	const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
	if (!baseUrl || !anonKey) return null;
	return { baseUrl, anonKey };
}

function scoreboardRequestUrl(): string | null {
	const cfg = getSupabaseConfig();
	if (!cfg) return null;
	return new URL(SCOREBOARD_PATH, `${cfg.baseUrl}/`).toString();
}

function authHeaders(): Record<string, string> {
	const cfg = getSupabaseConfig();
	if (!cfg) return {};
	return {
		Authorization: `Bearer ${cfg.anonKey}`,
		apikey: cfg.anonKey,
	};
}

export function isScoreboardConfigured(): boolean {
	return scoreboardRequestUrl() !== null;
}

async function responseErrorMessage(res: Response, fallback: string): Promise<string> {
	const text = await res.text();
	if (!text) return fallback;
	try {
		const data = JSON.parse(text) as { error?: unknown };
		return typeof data.error === 'string' && data.error ? data.error : text;
	} catch {
		return text;
	}
}

export async function fetchTopScores(): Promise<ScoreRow[]> {
	const url = scoreboardRequestUrl();
	if (!url) {
		throw new Error('Global scoreboard is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
	}
	const res = await fetch(url, {
		method: 'GET',
		headers: { ...authHeaders() },
	});
	if (!res.ok) {
		throw new Error(await responseErrorMessage(res, `GET scoreboard failed (${res.status})`));
	}
	const data = (await res.json()) as { scores?: ScoreRow[] };
	return Array.isArray(data.scores) ? data.scores : [];
}

export async function createUser(name: string, userId?: string): Promise<ScoreboardUser> {
	const url = scoreboardRequestUrl();
	if (!url) {
		throw new Error('Global scoreboard is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
	}
	const res = await fetch(url, {
		method: 'POST',
		headers: { ...authHeaders(), 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'create_user', name, user_id: userId }),
	});
	if (!res.ok) {
		const message = await responseErrorMessage(res, `POST scoreboard failed (${res.status})`);
		if (res.status === 409) throw new ScoreboardNameTakenError(message);
		throw new Error(message);
	}
	const data = (await res.json()) as { user?: ScoreboardUser };
	if (!data.user?.id || !data.user.name) {
		throw new Error('Create user response was missing user data.');
	}
	return data.user;
}

export async function submitScore(userId: string, finishTimeMs: number): Promise<void> {
	const url = scoreboardRequestUrl();
	if (!url) {
		throw new Error('Global scoreboard is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
	}
	const res = await fetch(url, {
		method: 'POST',
		headers: { ...authHeaders(), 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'submit_score', user_id: userId, finish_time_ms: finishTimeMs }),
	});
	if (!res.ok) {
		throw new Error(await responseErrorMessage(res, `POST scoreboard failed (${res.status})`));
	}
}
