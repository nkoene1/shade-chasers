-- Global singleplayer finish times (read/write from Edge Function with service role only).

create table if not exists public.shade_chasers_scores (
	id uuid primary key default gen_random_uuid(),
	player_name text not null,
	finish_time_ms integer not null,
	created_at timestamptz not null default now(),
	constraint scores_player_name_len check (char_length(btrim(player_name)) between 1 and 32),
	constraint scores_finish_time_sane check (finish_time_ms > 0 and finish_time_ms <= 14400000)
);

create index if not exists scores_fastest_idx on public.shade_chasers_scores (finish_time_ms asc, created_at asc);

alter table public.shade_chasers_scores enable row level security;

-- No GRANTs to `anon` / `authenticated`: access only via the service role (e.g. Edge Function).

comment on table public.shade_chasers_scores is 'Shade Chasers global best times; clients use the scoreboard Edge Function.';
