import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as const;

type ScoreRow = {
	id: string;
	user_id: string;
	player_name: string;
	finish_time_ms: number;
	created_at: string;
};

type UserRow = {
	id: string;
	name: string;
};

type JoinedScoreRow = {
	id: string;
	user_id: string;
	finish_time_ms: number;
	created_at: string;
	user?: { name?: string } | { name?: string }[] | null;
};

type ExistingScoreRow = {
	id: string;
	finish_time_ms: number;
};

function jsonRes(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...cors, 'Content-Type': 'application/json' },
	});
}

function errorMessage(error: unknown, fallback: string): string {
	if (typeof error === 'object' && error != null && 'message' in error) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === 'string' && message) return message;
	}
	return fallback;
}

function errorCode(error: unknown): string {
	if (typeof error === 'object' && error != null && 'code' in error) {
		const code = (error as { code?: unknown }).code;
		if (typeof code === 'string') return code;
	}
	return '';
}

function parseName(raw: unknown): string {
	if (typeof raw !== 'string') return '';
	return raw
		.replace(/[\u0000-\u001F\u007F]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 32);
}

function parseFinishMs(raw: unknown): number | null {
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return Math.trunc(raw);
	}
	if (typeof raw === 'string' && raw.length > 0) {
		const n = Number(raw);
		if (Number.isFinite(n)) return Math.trunc(n);
	}
	return null;
}

function parseUuid(raw: unknown): string {
	if (typeof raw !== 'string') return '';
	const value = raw.trim();
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : '';
}

function joinedScoreToRow(row: JoinedScoreRow): ScoreRow {
	const user = Array.isArray(row.user) ? row.user[0] : row.user;
	return {
		id: row.id,
		user_id: row.user_id,
		player_name: user?.name ?? 'Runner',
		finish_time_ms: row.finish_time_ms,
		created_at: row.created_at,
	};
}

async function claimUser(
	supabase: ReturnType<typeof createClient>,
	name: string,
	userId: string
): Promise<{ user?: UserRow; error?: unknown; conflict?: boolean }> {
	if (userId) {
		const { data: existingUser, error: fetchError } = await supabase
			.from('shade_chasers_users')
			.select('id, name')
			.eq('id', userId)
			.maybeSingle();
		if (fetchError) return { error: fetchError };
		if (existingUser) {
			if (existingUser.name === name) {
				return { user: existingUser as UserRow };
			}

			const { data: updatedUser, error: updateError } = await supabase
				.from('shade_chasers_users')
				.update({ name })
				.eq('id', userId)
				.select('id, name')
				.single();
			if (updateError) {
				return { error: updateError, conflict: updateError.code === '23505' };
			}
			return { user: updatedUser as UserRow };
		}
	}

	const { data, error } = await supabase.from('shade_chasers_users').insert({ name }).select('id, name').single();
	if (error) {
		return { error, conflict: error.code === '23505' };
	}
	return { user: data as UserRow };
}

async function saveBestScore(
	supabase: ReturnType<typeof createClient>,
	userId: string,
	finishMs: number
): Promise<{ saved?: boolean; error?: unknown }> {
	const { data: existingScores, error: selectError } = await supabase
		.from('shade_chasers_scores')
		.select('id, finish_time_ms')
		.eq('user_id', userId)
		.order('finish_time_ms', { ascending: true })
		.order('created_at', { ascending: true });
	if (selectError) return { error: selectError };

	const scores = Array.isArray(existingScores) ? (existingScores as ExistingScoreRow[]) : [];
	const existingScore = scores[0];
	if (!existingScore) {
		const { error: insertError } = await supabase
			.from('shade_chasers_scores')
			.insert({ user_id: userId, finish_time_ms: finishMs });
		return insertError ? { error: insertError } : { saved: true };
	}

	const duplicateIds = scores.slice(1).map((score) => score.id);
	if (duplicateIds.length > 0) {
		const { error: deleteError } = await supabase.from('shade_chasers_scores').delete().in('id', duplicateIds);
		if (deleteError) return { error: deleteError };
	}

	if (existingScore.finish_time_ms <= finishMs) {
		return { saved: false };
	}

	const { error: updateError } = await supabase
		.from('shade_chasers_scores')
		.update({ finish_time_ms: finishMs, created_at: new Date().toISOString() })
		.eq('id', existingScore.id);
	return updateError ? { error: updateError } : { saved: true };
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: { ...cors } });
	}

	const supabaseUrl = Deno.env.get('SUPABASE_URL');
	const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	if (!supabaseUrl || !serviceKey) {
		return jsonRes({ error: 'Server is missing Supabase configuration' }, 500);
	}
	const supabase = createClient(supabaseUrl, serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});

	if (req.method === 'GET') {
		const { data, error } = await supabase
			.from('shade_chasers_scores')
			.select('id, user_id, finish_time_ms, created_at, user:shade_chasers_users!scores_user_id_fkey(name)')
			.order('finish_time_ms', { ascending: true })
			.order('created_at', { ascending: true })
			.limit(10);
		if (error) {
			return jsonRes({ error: error.message }, 500);
		}
		return jsonRes({ scores: (data as JoinedScoreRow[]).map(joinedScoreToRow) });
	}

	if (req.method === 'POST') {
		let body: unknown;
		try {
			body = await req.json();
		} catch {
			return jsonRes({ error: 'Invalid JSON' }, 400);
		}
		const b = body as { action?: unknown; name?: unknown; user_id?: unknown; finish_time_ms?: unknown };
		const action = typeof b.action === 'string' ? b.action : '';

		if (action === 'create_user') {
			const name = parseName(b.name);
			const userId = parseUuid(b.user_id);
			if (!name) {
				return jsonRes({ error: 'name is required' }, 400);
			}

			const { user, error, conflict } = await claimUser(supabase, name, userId);
			if (error) {
				if (conflict) {
					return jsonRes({ error: 'That display name is already taken.' }, 409);
				}
				return jsonRes({ error: errorMessage(error, 'Could not claim user.') }, 500);
			}
			return jsonRes({ user });
		}

		if (action === 'submit_score') {
			const userId = parseUuid(b.user_id);
			const finishMs = parseFinishMs(b.finish_time_ms);
			if (!userId) {
				return jsonRes({ error: 'user_id is required' }, 400);
			}
			if (finishMs == null || finishMs < 1 || finishMs > 14_400_000) {
				return jsonRes({ error: 'finish_time_ms is out of range' }, 400);
			}

			const { saved, error } = await saveBestScore(supabase, userId, finishMs);
			if (error) {
				if (errorCode(error) === '23503') {
					return jsonRes({ error: 'Unknown user_id' }, 400);
				}
				return jsonRes({ error: errorMessage(error, 'Could not save score.') }, 500);
			}
			return jsonRes({ ok: true, saved: saved ?? false });
		}

		return jsonRes({ error: 'Unknown action' }, 400);
	}

	return new Response('Method Not Allowed', { status: 405, headers: { ...cors } });
});
