-- Dedicated players table and score ownership by stable user id.

create table if not exists public.shade_chasers_users (
	id uuid primary key default gen_random_uuid(),
	name text not null unique,
	created_at timestamptz not null default now(),
	constraint users_name_len check (char_length(btrim(name)) between 1 and 32)
);

alter table public.shade_chasers_users enable row level security;

comment on table public.shade_chasers_users is 'Shade Chasers players; clients create users through the scoreboard Edge Function.';

alter table public.shade_chasers_scores
	add column if not exists user_id uuid;

insert into public.shade_chasers_users (name)
select distinct btrim(player_name)
from public.shade_chasers_scores
where player_name is not null
	and btrim(player_name) <> ''
on conflict (name) do nothing;

update public.shade_chasers_scores as scores
set user_id = users.id
from public.shade_chasers_users as users
where scores.user_id is null
	and btrim(scores.player_name) = users.name;

alter table public.shade_chasers_scores
	alter column user_id set not null;

alter table public.shade_chasers_scores
	drop constraint if exists scores_player_name_len;

alter table public.shade_chasers_scores
	drop column if exists player_name;

create index if not exists scores_user_id_idx on public.shade_chasers_scores (user_id);

do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'scores_user_id_fkey'
			and conrelid = 'public.shade_chasers_scores'::regclass
	) then
		alter table public.shade_chasers_scores
			add constraint scores_user_id_fkey
			foreign key (user_id)
			references public.shade_chasers_users(id)
			on delete restrict;
	end if;
end $$;
