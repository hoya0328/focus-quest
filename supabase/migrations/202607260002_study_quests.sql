create table if not exists public.study_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  goal text not null default '' check (char_length(goal) <= 300),
  target_date date,
  weekly_minutes integer not null default 300 check (weekly_minutes between 0 and 10080),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, user_id)
);

create table if not exists public.study_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null,
  title text not null check (char_length(title) between 1 and 100),
  objective text not null default '' check (char_length(objective) <= 500),
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed')),
  adventure_id text not null default 'hike'
    check (adventure_id in ('hike', 'swim', 'fish')),
  focus_minutes integer not null default 25 check (focus_minutes between 1 and 120),
  break_minutes integer not null default 5 check (break_minutes between 1 and 30),
  target_sets integer not null default 4 check (target_sets between 1 and 12),
  completed_sets integer not null default 0
    check (completed_sets between 0 and target_sets),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  unique (id, user_id),
  constraint study_quests_owned_subject_fkey
    foreign key (subject_id, user_id)
    references public.study_subjects(id, user_id)
    on delete cascade
);

create index if not exists study_subjects_user_updated_idx
  on public.study_subjects(user_id, updated_at desc);
create index if not exists study_quests_subject_status_idx
  on public.study_quests(subject_id, status, created_at);

create table if not exists public.study_quest_focus_sessions (
  session_id text primary key check (char_length(session_id) between 1 and 160),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid not null,
  duration_minutes integer not null check (duration_minutes between 1 and 120),
  completed_at timestamptz not null default timezone('utc', now()),
  constraint study_quest_sessions_owned_quest_fkey
    foreign key (quest_id, user_id)
    references public.study_quests(id, user_id)
    on delete cascade
);

create index if not exists study_quest_sessions_quest_completed_idx
  on public.study_quest_focus_sessions(quest_id, completed_at desc);

alter table public.study_subjects enable row level security;
alter table public.study_quests enable row level security;
alter table public.study_quest_focus_sessions enable row level security;

revoke all on table public.study_subjects, public.study_quests,
  public.study_quest_focus_sessions from anon;
grant select, insert, update, delete
  on table public.study_subjects, public.study_quests,
    public.study_quest_focus_sessions
  to authenticated;

drop policy if exists "Users manage their own subjects" on public.study_subjects;
create policy "Users manage their own subjects"
  on public.study_subjects
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own quests" on public.study_quests;
create policy "Users manage their own quests"
  on public.study_quests
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own quest sessions"
  on public.study_quest_focus_sessions;
create policy "Users manage their own quest sessions"
  on public.study_quest_focus_sessions
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.complete_study_quest_set(
  p_quest_id uuid,
  p_session_id text,
  p_duration_minutes integer
)
returns public.study_quests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed public.study_quests;
  inserted_count integer;
begin
  insert into public.study_quest_focus_sessions (
    session_id,
    user_id,
    quest_id,
    duration_minutes
  )
  values (
    p_session_id,
    (select auth.uid()),
    p_quest_id,
    p_duration_minutes
  )
  on conflict (session_id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    select * into changed
    from public.study_quests
    where id = p_quest_id
      and user_id = (select auth.uid());
    return changed;
  end if;

  update public.study_quests
  set
    completed_sets = least(completed_sets + 1, target_sets),
    status = case
      when completed_sets + 1 >= target_sets then 'completed'
      else 'in_progress'
    end,
    completed_at = case
      when completed_sets + 1 >= target_sets then timezone('utc', now())
      else null
    end,
    updated_at = timezone('utc', now())
  where id = p_quest_id
    and user_id = (select auth.uid())
  returning * into changed;

  if changed.id is null then
    raise exception 'Quest not found or access denied';
  end if;
  return changed;
end;
$$;

revoke all on function public.complete_study_quest_set(uuid, text, integer)
  from public, anon;
grant execute on function public.complete_study_quest_set(uuid, text, integer)
  to authenticated;
