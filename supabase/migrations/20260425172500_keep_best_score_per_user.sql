-- Persist only each user's best finish time.

with ranked_scores as (
	select
		id,
		row_number() over (
			partition by user_id
			order by finish_time_ms asc, created_at asc, id asc
		) as score_rank
	from public.shade_chasers_scores
)
delete from public.shade_chasers_scores as scores
using ranked_scores
where scores.id = ranked_scores.id
	and ranked_scores.score_rank > 1;

drop index if exists public.scores_user_id_idx;

create unique index if not exists scores_user_id_unique_idx
	on public.shade_chasers_scores (user_id);

create or replace function public.submit_shade_chasers_score(
	p_user_id uuid,
	p_finish_time_ms integer
)
returns table (
	id uuid,
	user_id uuid,
	finish_time_ms integer,
	created_at timestamptz,
	saved boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
	submitted_at timestamptz := now();
begin
	if p_finish_time_ms <= 0 or p_finish_time_ms > 14400000 then
		raise exception 'finish_time_ms is out of range' using errcode = '22023';
	end if;

	return query
	with upserted as (
		insert into public.shade_chasers_scores as current_scores (
			user_id,
			finish_time_ms,
			created_at
		)
		values (
			p_user_id,
			p_finish_time_ms,
			submitted_at
		)
		on conflict (user_id) do update
		set
			finish_time_ms = excluded.finish_time_ms,
			created_at = excluded.created_at
		where current_scores.finish_time_ms > excluded.finish_time_ms
		returning
			current_scores.id,
			current_scores.user_id,
			current_scores.finish_time_ms,
			current_scores.created_at,
			true as saved
	)
	select
		upserted.id,
		upserted.user_id,
		upserted.finish_time_ms,
		upserted.created_at,
		upserted.saved
	from upserted
	union all
	select
		current_scores.id,
		current_scores.user_id,
		current_scores.finish_time_ms,
		current_scores.created_at,
		false as saved
	from public.shade_chasers_scores as current_scores
	where current_scores.user_id = p_user_id
		and not exists (select 1 from upserted);
end;
$$;
