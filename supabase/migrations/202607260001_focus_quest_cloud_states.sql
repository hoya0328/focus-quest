create table if not exists public.focus_quest_cloud_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 1 check (version >= 1),
  payload jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.focus_quest_cloud_states enable row level security;

revoke all on table public.focus_quest_cloud_states from anon;
grant select, insert, update, delete
  on table public.focus_quest_cloud_states
  to authenticated;

drop policy if exists "Users can read their own Focus Quest state"
  on public.focus_quest_cloud_states;
create policy "Users can read their own Focus Quest state"
  on public.focus_quest_cloud_states
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own Focus Quest state"
  on public.focus_quest_cloud_states;
create policy "Users can create their own Focus Quest state"
  on public.focus_quest_cloud_states
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Focus Quest state"
  on public.focus_quest_cloud_states;
create policy "Users can update their own Focus Quest state"
  on public.focus_quest_cloud_states
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Focus Quest state"
  on public.focus_quest_cloud_states;
create policy "Users can delete their own Focus Quest state"
  on public.focus_quest_cloud_states
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
