create table if not exists public.study_quest_progress (
  quest_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid,
  last_reached_page integer not null check (last_reached_page between 1 and 120),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (quest_id, user_id),
  constraint study_quest_progress_owned_quest_fkey
    foreign key (quest_id, user_id)
    references public.study_quests(id, user_id)
    on delete cascade,
  constraint study_quest_progress_owned_material_fkey
    foreign key (material_id, user_id)
    references public.study_materials(id, user_id)
    on delete cascade
);

create table if not exists public.study_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid not null,
  material_id uuid not null,
  session_key text not null check (char_length(session_key) between 1 and 160),
  stage text not null check (stage in ('checkpoint', 'review')),
  quiz_key text not null check (char_length(quiz_key) between 1 and 200),
  range_start integer not null check (range_start between 1 and 120),
  range_end integer not null check (range_end between range_start and 120),
  reached_page integer not null check (reached_page between range_start and range_end),
  selected_index integer check (selected_index between 0 and 3),
  is_correct boolean,
  skipped boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, session_key, stage),
  constraint study_quiz_attempts_owned_quest_fkey
    foreign key (quest_id, user_id)
    references public.study_quests(id, user_id)
    on delete cascade,
  constraint study_quiz_attempts_owned_material_fkey
    foreign key (material_id, user_id)
    references public.study_materials(id, user_id)
    on delete cascade,
  constraint study_quiz_attempt_answer_shape_check check (
    (skipped and selected_index is null and is_correct is null)
    or
    (not skipped and selected_index is not null and is_correct is not null)
  )
);

create index if not exists study_quiz_attempts_quest_created_idx
  on public.study_quiz_attempts(user_id, quest_id, created_at desc);

create table if not exists public.focus_quest_product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name in (
    'focus_started',
    'focus_completed',
    'focus_abandoned',
    'quiz_answered',
    'quiz_skipped',
    'client_error'
  )),
  adventure_id text check (adventure_id in ('hike', 'swim', 'fish')),
  duration_minutes integer check (duration_minutes between 1 and 120),
  quest_id uuid,
  outcome text check (outcome in (
    'completed',
    'abandoned',
    'correct',
    'incorrect',
    'skipped'
  )),
  error_code text check (char_length(error_code) <= 80),
  created_at timestamptz not null default timezone('utc', now()),
  constraint focus_quest_product_events_owned_quest_fkey
    foreign key (quest_id, user_id)
    references public.study_quests(id, user_id)
    on delete cascade
);

create index if not exists focus_quest_product_events_user_created_idx
  on public.focus_quest_product_events(user_id, created_at desc);
create index if not exists focus_quest_product_events_name_created_idx
  on public.focus_quest_product_events(event_name, created_at desc);

alter table public.study_quest_progress enable row level security;
alter table public.study_quiz_attempts enable row level security;
alter table public.focus_quest_product_events enable row level security;

revoke all on table public.study_quest_progress,
  public.study_quiz_attempts,
  public.focus_quest_product_events from anon;

grant select, insert, update, delete on table public.study_quest_progress,
  public.study_quiz_attempts to authenticated;
grant select, insert, delete on table public.focus_quest_product_events
  to authenticated;

drop policy if exists "Users manage their own study progress"
  on public.study_quest_progress;
create policy "Users manage their own study progress"
  on public.study_quest_progress
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own quiz attempts"
  on public.study_quiz_attempts;
create policy "Users manage their own quiz attempts"
  on public.study_quiz_attempts
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users create their own product events"
  on public.focus_quest_product_events;
create policy "Users create their own product events"
  on public.focus_quest_product_events
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users read their own product events"
  on public.focus_quest_product_events;
create policy "Users read their own product events"
  on public.focus_quest_product_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own product events"
  on public.focus_quest_product_events;
create policy "Users delete their own product events"
  on public.focus_quest_product_events
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.save_study_quest_progress(
  p_quest_id uuid,
  p_material_id uuid,
  p_reached_page integer
)
returns public.study_quest_progress
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed public.study_quest_progress;
begin
  if p_reached_page < 1 or p_reached_page > 120 then
    raise exception 'Reached page is out of range';
  end if;

  if not exists (
    select 1
    from public.study_quests
    where id = p_quest_id
      and user_id = (select auth.uid())
      and material_id = p_material_id
  ) then
    raise exception 'Quest or material not found or access denied';
  end if;

  insert into public.study_quest_progress (
    quest_id,
    user_id,
    material_id,
    last_reached_page
  ) values (
    p_quest_id,
    (select auth.uid()),
    p_material_id,
    p_reached_page
  )
  on conflict (quest_id) do update
  set
    last_reached_page = greatest(
      public.study_quest_progress.last_reached_page,
      excluded.last_reached_page
    ),
    material_id = excluded.material_id,
    updated_at = timezone('utc', now())
  returning * into changed;

  return changed;
end;
$$;

revoke all on function public.save_study_quest_progress(uuid, uuid, integer)
  from public, anon;
grant execute on function public.save_study_quest_progress(uuid, uuid, integer)
  to authenticated;
