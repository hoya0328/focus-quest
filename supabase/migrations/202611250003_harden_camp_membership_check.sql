drop policy if exists "Camp members read their room" on public.focus_quest_camps;
drop policy if exists "Camp members read their party" on public.focus_quest_camp_members;

revoke all on function public.is_active_focus_quest_camp_member(uuid, uuid)
  from public, anon, authenticated;
drop function public.is_active_focus_quest_camp_member(uuid, uuid);

create or replace function public.is_active_focus_quest_camp_member(
  requested_camp_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.focus_quest_camp_members member
    where member.camp_id = requested_camp_id
      and member.user_id = (select auth.uid())
      and member.left_at is null
  );
$$;

revoke all on function public.is_active_focus_quest_camp_member(uuid)
  from public, anon;
grant execute on function public.is_active_focus_quest_camp_member(uuid)
  to authenticated;

create policy "Camp members read their room"
  on public.focus_quest_camps
  for select
  to authenticated
  using (public.is_active_focus_quest_camp_member(id));

create policy "Camp members read their party"
  on public.focus_quest_camp_members
  for select
  to authenticated
  using (public.is_active_focus_quest_camp_member(camp_id));
